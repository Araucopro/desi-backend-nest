import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import {
  JwtPayload,
  MasterJwtPayload,
} from '../auth/interfaces/jwt-payload.interface';
import { isUniqueViolation } from '../common/utils/db-errors.util';
import { TenantContextService } from '../multitenant/tenant-context.service';
import { UserstoresService } from '../relations/userstores/userstores.service';
import { CashClosingsService } from './cash-closings.service';
import { CashDenominationsService } from './cash-denominations.service';
import {
  assertUserCanAccessStore,
  findCashRegisterOrFail,
  findOpenSessionOrFail,
  findSessionOrFail,
  resolveActingUserId,
  toMoney,
} from './cash-registers.helpers';
import { CancelCashCountDto } from './dto/cancel-cash-count.dto';
import { CompleteCashCountDto } from './dto/complete-cash-count.dto';
import { StartCashCountDto } from './dto/start-cash-count.dto';
import { UpsertCashCountItemsDto } from './dto/upsert-cash-count-items.dto';
import { CashCount, CashCountStatus } from './entities/cash-count.entity';
import { CashCountItem } from './entities/cash-count-item.entity';
import {
  CashRegisterClosing,
  CashRegisterClosingStatus,
} from './entities/cash-register-closing.entity';
import { CashRegisterSession } from './entities/cash-register-session.entity';

type PendingClosingContext = {
  session: CashRegisterSession;
  closing: CashRegisterClosing;
};

/**
 * Arqueo físico detallado por denominaciones (Hito 4).
 *
 * Flujo: `start` abre un conteo `DRAFT` sobre el arqueo `PENDING` de la sesión,
 * `upsertItems` desglosa billetes y monedas, `complete` sella el total y lo
 * proyecta a `CashRegisterClosing.countedCashAmount` (conciliación), y
 * `cancel` descarta un conteo en curso para rehacerlo desde cero.
 */
@Injectable()
export class CashCountsService {
  constructor(
    @InjectRepository(CashCount)
    private readonly cashCountRepository: Repository<CashCount>,
    private readonly cashClosingsService: CashClosingsService,
    private readonly cashDenominationsService: CashDenominationsService,
    private readonly userstoresService: UserstoresService,
    @Optional() private readonly tenantContext?: TenantContextService,
  ) {}

  private runInTransaction<T>(
    callback: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return this.tenantContext
      ? this.tenantContext.transaction(callback)
      : this.cashCountRepository.manager.transaction(callback);
  }

  private getEffectiveTenantId(): string {
    const tenantId = this.tenantContext?.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('Contexto tenant no disponible');
    }
    return tenantId;
  }

  /**
   * Valida caja, pertenencia de tienda del usuario, sesión `OPEN` y arqueo
   * `PENDING` en curso. Bloquea sesión y cierre para serializar el conteo con
   * cobros y movimientos concurrentes.
   */
  private async resolvePendingClosing(
    manager: EntityManager,
    cashRegisterID: string,
    sessionID: string,
    user: JwtPayload | MasterJwtPayload,
    tenantID: string,
  ): Promise<PendingClosingContext> {
    const register = await findCashRegisterOrFail(
      manager,
      cashRegisterID,
      tenantID,
    );
    await assertUserCanAccessStore(
      this.userstoresService,
      user,
      register.storeID,
    );

    const session = await findOpenSessionOrFail(manager, cashRegisterID, {
      tenantID,
      lock: true,
    });
    if (session.sessionID !== sessionID) {
      throw new NotFoundException(
        `Sesión con ID ${sessionID} no encontrada para la caja ${cashRegisterID}`,
      );
    }

    const closing = await manager.getRepository(CashRegisterClosing).findOne({
      where: {
        sessionID: session.sessionID,
        tenantID,
        status: CashRegisterClosingStatus.PENDING,
      },
      lock: { mode: 'pessimistic_write' },
    });
    if (!closing) {
      throw new NotFoundException(
        `La sesión ${sessionID} no tiene un arqueo en curso (PENDING). Inicie el arqueo antes de contar denominaciones`,
      );
    }

    return { session, closing };
  }

  private async findDraftOrFail(
    manager: EntityManager,
    closingID: string,
    tenantID: string,
  ): Promise<CashCount> {
    const count = await manager.getRepository(CashCount).findOne({
      where: { closingID, tenantID, status: CashCountStatus.DRAFT },
      lock: { mode: 'pessimistic_write' },
    });

    if (!count) {
      throw new NotFoundException(
        `El arqueo ${closingID} no tiene un conteo detallado en curso (DRAFT). Inicie el conteo antes de continuar`,
      );
    }

    return count;
  }

  private async findCountWithItems(
    manager: EntityManager,
    cashCountID: string,
    tenantID: string,
  ): Promise<CashCount> {
    const count = await manager.getRepository(CashCount).findOne({
      where: { cashCountID, tenantID },
      relations: ['items', 'items.denomination'],
    });

    if (!count) {
      throw new NotFoundException(
        `Conteo de caja con ID ${cashCountID} no encontrado`,
      );
    }

    count.items = [...(count.items ?? [])].sort(
      (a, b) => Number(b.denominationValue) - Number(a.denominationValue),
    );

    return count;
  }

  private async sumCountItems(
    manager: EntityManager,
    cashCountID: string,
    tenantID: string,
  ): Promise<{ total: number; itemCount: number }> {
    const items = await manager.getRepository(CashCountItem).find({
      where: { tenantID, cashCountID },
    });

    return {
      total: toMoney(
        items.reduce(
          (accumulator, item) => accumulator + Number(item.subtotal),
          0,
        ),
      ),
      itemCount: items.length,
    };
  }

  /**
   * Inicia el conteo detallado del arqueo en curso. Solo puede existir un
   * conteo `DRAFT` por cierre (índice único parcial) y ninguno si el arqueo ya
   * tiene un conteo completado.
   */
  async start(
    cashRegisterID: string,
    sessionID: string,
    dto: StartCashCountDto,
    user: JwtPayload | MasterJwtPayload,
  ): Promise<CashCount> {
    const tenantID = this.getEffectiveTenantId();

    return this.runInTransaction(async (manager) => {
      const { session, closing } = await this.resolvePendingClosing(
        manager,
        cashRegisterID,
        sessionID,
        user,
        tenantID,
      );

      const repository = manager.getRepository(CashCount);
      const completed = await repository.findOne({
        where: {
          closingID: closing.closingID,
          tenantID,
          status: CashCountStatus.COMPLETED,
        },
      });
      if (completed) {
        throw new ConflictException(
          `El arqueo ya tiene un conteo detallado completado (ID: ${completed.cashCountID}); el monto contado ya está conciliado`,
        );
      }

      const draft = await repository.findOne({
        where: {
          closingID: closing.closingID,
          tenantID,
          status: CashCountStatus.DRAFT,
        },
      });
      if (draft) {
        throw new ConflictException(
          `El arqueo ya tiene un conteo detallado en curso (ID: ${draft.cashCountID}); complételo o cancélelo antes de iniciar otro`,
        );
      }

      const count = repository.create({
        tenantID,
        closingID: closing.closingID,
        sessionID: session.sessionID,
        status: CashCountStatus.DRAFT,
        totalAmount: 0,
        itemCount: 0,
        countedByUserID: resolveActingUserId(user),
        startedAt: new Date(),
        notes: dto.notes?.trim() || null,
      });

      try {
        const saved = await repository.save(count);
        return await this.findCountWithItems(
          manager,
          saved.cashCountID,
          tenantID,
        );
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ConflictException(
            'El arqueo ya tiene un conteo detallado en curso',
          );
        }
        throw error;
      }
    });
  }

  /**
   * Desglose de denominaciones del conteo en curso. Los ítems con cantidad 0
   * se eliminan y el total del conteo se recalcula desde los ítems vigentes.
   */
  async upsertItems(
    cashRegisterID: string,
    sessionID: string,
    dto: UpsertCashCountItemsDto,
    user: JwtPayload | MasterJwtPayload,
  ): Promise<CashCount> {
    const tenantID = this.getEffectiveTenantId();

    return this.runInTransaction(async (manager) => {
      const { closing } = await this.resolvePendingClosing(
        manager,
        cashRegisterID,
        sessionID,
        user,
        tenantID,
      );
      const count = await this.findDraftOrFail(
        manager,
        closing.closingID,
        tenantID,
      );

      const denominationIDs = dto.items.map((item) => item.denominationID);
      if (new Set(denominationIDs).size !== denominationIDs.length) {
        throw new BadRequestException(
          'La lista de denominaciones contiene IDs duplicados',
        );
      }

      const denominations =
        await this.cashDenominationsService.resolveUsableByIds(
          manager,
          tenantID,
          denominationIDs,
        );
      const itemRepository = manager.getRepository(CashCountItem);

      for (const item of dto.items) {
        const denomination = denominations.get(item.denominationID);
        if (!denomination) {
          throw new BadRequestException(
            `La denominación ${item.denominationID} no está disponible en el catálogo`,
          );
        }

        const existingItem = await itemRepository.findOne({
          where: {
            tenantID,
            cashCountID: count.cashCountID,
            denominationID: item.denominationID,
          },
        });

        if (item.quantity === 0) {
          if (existingItem) await itemRepository.remove(existingItem);
          continue;
        }

        const denominationValue = toMoney(Number(denomination.value));
        const subtotal = toMoney(denominationValue * item.quantity);

        if (existingItem) {
          existingItem.quantity = item.quantity;
          existingItem.denominationValue = denominationValue;
          existingItem.denominationType = denomination.type;
          existingItem.subtotal = subtotal;
          await itemRepository.save(existingItem);
          continue;
        }

        await itemRepository.save(
          itemRepository.create({
            tenantID,
            cashCountID: count.cashCountID,
            denominationID: denomination.cashDenominationID,
            denominationValue,
            denominationType: denomination.type,
            quantity: item.quantity,
            subtotal,
          }),
        );
      }

      const totals = await this.sumCountItems(
        manager,
        count.cashCountID,
        tenantID,
      );
      count.totalAmount = totals.total;
      count.itemCount = totals.itemCount;
      await manager.getRepository(CashCount).save(count);

      return this.findCountWithItems(manager, count.cashCountID, tenantID);
    });
  }

  /**
   * Sella el conteo: su total de denominaciones pasa a ser el efectivo contado
   * del arqueo (`countedCashAmount`), recalculando la diferencia conciliada.
   */
  async complete(
    cashRegisterID: string,
    sessionID: string,
    dto: CompleteCashCountDto,
    user: JwtPayload | MasterJwtPayload,
  ): Promise<CashCount> {
    const tenantID = this.getEffectiveTenantId();

    return this.runInTransaction(async (manager) => {
      const { session, closing } = await this.resolvePendingClosing(
        manager,
        cashRegisterID,
        sessionID,
        user,
        tenantID,
      );
      const count = await this.findDraftOrFail(
        manager,
        closing.closingID,
        tenantID,
      );

      const totals = await this.sumCountItems(
        manager,
        count.cashCountID,
        tenantID,
      );
      if (totals.itemCount === 0) {
        throw new BadRequestException(
          'Debe registrar al menos una denominación contada antes de completar el conteo',
        );
      }

      const completedAt = new Date();
      count.status = CashCountStatus.COMPLETED;
      count.totalAmount = totals.total;
      count.itemCount = totals.itemCount;
      count.completedByUserID = resolveActingUserId(user);
      count.countedAt = dto.countedAt ? new Date(dto.countedAt) : completedAt;
      if (dto.notes !== undefined) {
        count.notes = dto.notes.trim() || null;
      }

      const savedCount = await manager.getRepository(CashCount).save(count);

      await this.cashClosingsService.applyCountedCashAmount(
        manager,
        session,
        closing,
        savedCount.totalAmount,
      );

      return this.findCountWithItems(manager, savedCount.cashCountID, tenantID);
    });
  }

  /**
   * Descarta el conteo en curso para rehacerlo. El arqueo sigue `PENDING`, por
   * lo que el monto contado previo (si existía) no se modifica.
   */
  async cancel(
    cashRegisterID: string,
    sessionID: string,
    dto: CancelCashCountDto,
    user: JwtPayload | MasterJwtPayload,
  ): Promise<CashCount> {
    const tenantID = this.getEffectiveTenantId();

    return this.runInTransaction(async (manager) => {
      const { closing } = await this.resolvePendingClosing(
        manager,
        cashRegisterID,
        sessionID,
        user,
        tenantID,
      );
      const count = await this.findDraftOrFail(
        manager,
        closing.closingID,
        tenantID,
      );

      count.status = CashCountStatus.CANCELLED;
      count.cancelledByUserID = resolveActingUserId(user);
      count.cancelledAt = new Date();
      count.cancellationReason = dto.reason.trim();

      const savedCount = await manager.getRepository(CashCount).save(count);

      return this.findCountWithItems(manager, savedCount.cashCountID, tenantID);
    });
  }

  /**
   * Último conteo detallado de la sesión (en curso o sellado), con su desglose
   * de denominaciones.
   */
  async findCurrent(
    cashRegisterID: string,
    sessionID: string,
  ): Promise<CashCount> {
    const tenantID = this.getEffectiveTenantId();

    return this.runInTransaction(async (manager) => {
      await findCashRegisterOrFail(manager, cashRegisterID, tenantID);
      await findSessionOrFail(manager, sessionID, cashRegisterID, tenantID);

      const count = await manager.getRepository(CashCount).findOne({
        where: { tenantID, sessionID },
        order: { startedAt: 'DESC' },
      });

      if (!count) {
        throw new NotFoundException(
          `La sesión ${sessionID} no tiene conteos detallados registrados`,
        );
      }

      return this.findCountWithItems(manager, count.cashCountID, tenantID);
    });
  }
}
