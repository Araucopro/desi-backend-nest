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
import {
  assertCashApprover,
  assertUserCanAccessStore,
  countOpenSessionTransfers,
  findCashRegisterOrFail,
  findOpenSessionOrFail,
  findSessionOrFail,
  closeSessionOperators,
  resolveActingUserId,
  sumSessionCashMovements,
  sumSessionPaymentsByMethod,
  toMoney,
} from './cash-registers.helpers';
import { CountCashRegisterClosingDto } from './dto/count-cash-register-closing.dto';
import { CompleteCashRegisterClosingDto } from './dto/complete-cash-register-closing.dto';
import { RejectCashRegisterClosingDto } from './dto/reject-cash-register-closing.dto';
import { StartCashRegisterClosingDto } from './dto/start-cash-register-closing.dto';
import {
  CashRegisterSession,
  CashRegisterSessionStatus,
} from './entities/cash-register-session.entity';
import { CashCount, CashCountStatus } from './entities/cash-count.entity';
import {
  CashPaymentMethodTotal,
  CashRegisterClosing,
  CashRegisterClosingStatus,
} from './entities/cash-register-closing.entity';

type CashRegisterClosingSnapshot = {
  expectedCashAmount: number;
  expectedNonCashAmount: number;
  expectedTotalAmount: number;
  cashMovementCount: number;
  paymentCount: number;
  paymentMethodTotals: CashPaymentMethodTotal[];
};

@Injectable()
export class CashClosingsService {
  constructor(
    @InjectRepository(CashRegisterClosing)
    private readonly cashRegisterClosingRepository: Repository<CashRegisterClosing>,
    private readonly userstoresService: UserstoresService,
    @Optional() private readonly tenantContext?: TenantContextService,
  ) {}

  private runInTransaction<T>(
    callback: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return this.tenantContext
      ? this.tenantContext.transaction(callback)
      : this.cashRegisterClosingRepository.manager.transaction(callback);
  }

  private getEffectiveTenantId(): string {
    const tenantId = this.tenantContext?.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('Contexto tenant no disponible');
    }
    return tenantId;
  }

  /**
   * Valida caja, pertenencia de tienda del usuario y sesión abierta cuyo ID
   * coincide con la ruta. La sesión se bloquea para serializar el arqueo con
   * cobros y movimientos concurrentes.
   */
  private async resolveOpenSession(
    manager: EntityManager,
    cashRegisterID: string,
    sessionID: string,
    user: JwtPayload | MasterJwtPayload,
    tenantID: string,
  ): Promise<CashRegisterSession> {
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

    return session;
  }

  private async findPendingClosingOrFail(
    manager: EntityManager,
    sessionID: string,
    tenantID: string,
  ): Promise<CashRegisterClosing> {
    const closing = await manager.getRepository(CashRegisterClosing).findOne({
      where: {
        sessionID,
        tenantID,
        status: CashRegisterClosingStatus.PENDING,
      },
      lock: { mode: 'pessimistic_write' },
    });

    if (!closing) {
      throw new NotFoundException(
        `La sesión ${sessionID} no tiene un arqueo en curso (PENDING). Inicie el arqueo antes de continuar`,
      );
    }

    return closing;
  }

  private resolveCountedCashAmount(
    dto: CompleteCashRegisterClosingDto,
    closing: CashRegisterClosing,
  ): number | null {
    if (dto.countedCashAmount !== undefined) {
      return toMoney(Number(dto.countedCashAmount));
    }

    const stored = closing.countedCashAmount;
    if (stored === null || stored === undefined) return null;

    return toMoney(Number(stored));
  }

  private async findCashCountByStatus(
    manager: EntityManager,
    closingID: string,
    tenantID: string,
    status: CashCountStatus,
  ): Promise<CashCount | null> {
    return manager.getRepository(CashCount).findOne({
      where: { closingID, tenantID, status },
    });
  }

  /**
   * Fotografía de conciliación: saldo esperado de efectivo (fondo inicial +
   * movimientos `POSTED`) y cobros `COMPLETED` agrupados por medio de pago. Se
   * recalcula al contar y al completar para que la diferencia refleje el
   * estado final de la sesión al momento de sellarla.
   */
  private async buildSnapshot(
    manager: EntityManager,
    session: CashRegisterSession,
  ): Promise<CashRegisterClosingSnapshot> {
    const cashTotals = await sumSessionCashMovements(
      manager,
      session.sessionID,
    );
    const paymentMethodTotals = await sumSessionPaymentsByMethod(
      manager,
      session.sessionID,
    );

    const expectedCashAmount = toMoney(
      Number(session.openingBalance ?? 0) + cashTotals.net,
    );
    const expectedNonCashAmount = toMoney(
      paymentMethodTotals
        .filter((item) => !item.affectsCash)
        .reduce((accumulator, item) => accumulator + item.amount, 0),
    );

    return {
      expectedCashAmount,
      expectedNonCashAmount,
      expectedTotalAmount: toMoney(expectedCashAmount + expectedNonCashAmount),
      cashMovementCount: cashTotals.movementCount,
      paymentCount: paymentMethodTotals.reduce(
        (accumulator, item) => accumulator + item.paymentCount,
        0,
      ),
      paymentMethodTotals,
    };
  }

  /**
   * Refresca la fotografía de conciliación y sella el monto contado sobre el
   * arqueo en curso. No persiste ni cambia el estado del cierre: el llamador
   * decide el estado final y guarda dentro de su transacción. Lo reutiliza el
   * arqueo detallado por denominaciones (Hito 4) al completarse.
   */
  private async buildCountedClosing(
    manager: EntityManager,
    session: CashRegisterSession,
    closing: CashRegisterClosing,
    countedCashAmount: number,
    notes?: string,
  ): Promise<CashRegisterClosing> {
    const snapshot = await this.buildSnapshot(manager, session);

    Object.assign(closing, snapshot);
    closing.countedCashAmount = toMoney(countedCashAmount);
    closing.cashDifference = toMoney(
      closing.countedCashAmount - snapshot.expectedCashAmount,
    );
    closing.actualTotalAmount = toMoney(
      closing.countedCashAmount + snapshot.expectedNonCashAmount,
    );
    if (notes !== undefined) {
      closing.notes = notes.trim() || null;
    }

    return closing;
  }

  /**
   * Proyecta un monto contado externo (conteo detallado por denominaciones) al
   * arqueo en curso y lo persiste. Debe invocarse dentro de una transacción
   * con el cierre bloqueado.
   */
  async applyCountedCashAmount(
    manager: EntityManager,
    session: CashRegisterSession,
    closing: CashRegisterClosing,
    countedCashAmount: number,
    notes?: string,
  ): Promise<CashRegisterClosing> {
    const updated = await this.buildCountedClosing(
      manager,
      session,
      closing,
      countedCashAmount,
      notes,
    );

    return manager.getRepository(CashRegisterClosing).save(updated);
  }

  /**
   * Una sesión no puede sellarse con traslados de fondos en curso: una vez
   * `CLOSED` la sesión es hermética y la transferencia ya no podría ejecutarse
   * (Regla 2). El operador debe completarla, rechazarla o cancelarla antes.
   */
  private async assertNoOpenTransfers(
    manager: EntityManager,
    sessionID: string,
    tenantID: string,
  ): Promise<void> {
    const openTransfers = await countOpenSessionTransfers(
      manager,
      tenantID,
      sessionID,
    );

    if (openTransfers > 0) {
      throw new BadRequestException(
        `La sesión tiene ${openTransfers} transferencia(s) de fondos en curso (PENDING/APPROVED). Complételas, recháncelas o cancélelas antes de cerrar la caja`,
      );
    }
  }

  /**
   * Inicia el arqueo formal: deja el cierre en `PENDING` y toma la fotografía
   * de saldo esperado y cobros por medio de pago. La sesión sigue `OPEN` hasta
   * que el cierre se completa.
   */
  async startClosing(
    cashRegisterID: string,
    sessionID: string,
    dto: StartCashRegisterClosingDto,
    user: JwtPayload | MasterJwtPayload,
  ): Promise<CashRegisterClosing> {
    const tenantID = this.getEffectiveTenantId();

    return this.runInTransaction(async (manager) => {
      const session = await this.resolveOpenSession(
        manager,
        cashRegisterID,
        sessionID,
        user,
        tenantID,
      );

      const repository = manager.getRepository(CashRegisterClosing);
      const pendingClosing = await repository.findOne({
        where: {
          sessionID: session.sessionID,
          tenantID,
          status: CashRegisterClosingStatus.PENDING,
        },
      });
      if (pendingClosing) {
        throw new ConflictException(
          `La sesión ya tiene un arqueo en curso (ID: ${pendingClosing.closingID}); complételo o recháncelo antes de iniciar uno nuevo`,
        );
      }

      const snapshot = await this.buildSnapshot(manager, session);
      const closing = repository.create({
        tenantID,
        sessionID: session.sessionID,
        status: CashRegisterClosingStatus.PENDING,
        ...snapshot,
        performedByUserID: resolveActingUserId(user),
        startedAt: new Date(),
        notes: dto.notes?.trim() ?? null,
      });

      try {
        return await repository.save(closing);
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ConflictException(
            'La sesión ya tiene un arqueo en curso (PENDING)',
          );
        }
        throw error;
      }
    });
  }

  /**
   * Registra el efectivo contado por el cajero y computa la diferencia contra
   * el saldo esperado. La sesión permanece `OPEN`.
   */
  async registerCount(
    cashRegisterID: string,
    sessionID: string,
    dto: CountCashRegisterClosingDto,
    user: JwtPayload | MasterJwtPayload,
  ): Promise<CashRegisterClosing> {
    const tenantID = this.getEffectiveTenantId();

    return this.runInTransaction(async (manager) => {
      const session = await this.resolveOpenSession(
        manager,
        cashRegisterID,
        sessionID,
        user,
        tenantID,
      );

      const closing = await this.findPendingClosingOrFail(
        manager,
        session.sessionID,
        tenantID,
      );

      // El conteo detallado sellado es la fuente del monto contado: no se
      // reemplaza con un registro manual para no romper la conciliación.
      const detailedCount = await this.findCashCountByStatus(
        manager,
        closing.closingID,
        tenantID,
        CashCountStatus.COMPLETED,
      );
      if (detailedCount) {
        throw new BadRequestException(
          `El monto contado proviene del conteo detallado por denominaciones (ID: ${detailedCount.cashCountID}) y no puede reemplazarse manualmente; rechace el arqueo para rehacerlo`,
        );
      }

      return this.applyCountedCashAmount(
        manager,
        session,
        closing,
        Number(dto.countedCashAmount),
        dto.notes,
      );
    });
  }

  /**
   * Completa el arqueo: sella los montos finales del cierre y pasa la sesión a
   * `CLOSED` (Regla 2: la sesión queda hermética).
   */
  async completeClosing(
    cashRegisterID: string,
    sessionID: string,
    dto: CompleteCashRegisterClosingDto,
    user: JwtPayload | MasterJwtPayload,
  ): Promise<CashRegisterClosing> {
    const tenantID = this.getEffectiveTenantId();
    const userId = resolveActingUserId(user);

    return this.runInTransaction(async (manager) => {
      const session = await this.resolveOpenSession(
        manager,
        cashRegisterID,
        sessionID,
        user,
        tenantID,
      );

      // Un traslado en curso ya no podría ejecutarse sobre una sesión sellada.
      await this.assertNoOpenTransfers(manager, session.sessionID, tenantID);

      const closing = await this.findPendingClosingOrFail(
        manager,
        session.sessionID,
        tenantID,
      );

      const draftCount = await this.findCashCountByStatus(
        manager,
        closing.closingID,
        tenantID,
        CashCountStatus.DRAFT,
      );
      if (draftCount) {
        throw new BadRequestException(
          `El arqueo tiene un conteo detallado en curso (ID: ${draftCount.cashCountID}). Complételo o cancélelo antes de cerrar la caja`,
        );
      }

      // El conteo detallado por denominaciones es la fuente del monto contado
      // cuando existe: evita que el cierre selle un valor distinto al arqueo.
      const detailedCount = await this.findCashCountByStatus(
        manager,
        closing.closingID,
        tenantID,
        CashCountStatus.COMPLETED,
      );
      const countedCashAmount = detailedCount
        ? toMoney(Number(detailedCount.totalAmount))
        : this.resolveCountedCashAmount(dto, closing);

      if (countedCashAmount === null) {
        throw new BadRequestException(
          'Debe registrar el efectivo contado (countedCashAmount) antes de completar el arqueo',
        );
      }

      if (
        detailedCount &&
        dto.countedCashAmount !== undefined &&
        toMoney(Number(dto.countedCashAmount)) !== countedCashAmount
      ) {
        throw new BadRequestException(
          `El monto contado proviene del conteo detallado por denominaciones (${countedCashAmount}); no envíe un countedCashAmount distinto`,
        );
      }

      const completedAt = new Date();
      const updatedClosing = await this.buildCountedClosing(
        manager,
        session,
        closing,
        countedCashAmount,
        dto.notes,
      );
      updatedClosing.status = CashRegisterClosingStatus.COMPLETED;
      updatedClosing.completedByUserID = userId;
      updatedClosing.completedAt = completedAt;

      const savedClosing = await manager
        .getRepository(CashRegisterClosing)
        .save(updatedClosing);

      session.expectedCashBalance = savedClosing.expectedCashAmount;
      session.countedCashBalance = countedCashAmount;
      session.cashDifference = savedClosing.cashDifference;
      session.closedByUserID = userId;
      session.closedAt = completedAt;
      session.status = CashRegisterSessionStatus.CLOSED;
      session.closingNotes = savedClosing.notes ?? null;
      await manager.getRepository(CashRegisterSession).save(session);

      // Ninguna sesión cerrada puede quedar con operadores "en turno".
      await closeSessionOperators(manager, session.sessionID, completedAt);

      return savedClosing;
    });
  }

  /**
   * Rechaza el arqueo en curso (revisión de supervisor). La sesión permanece
   * `OPEN` para rehacer el conteo con un nuevo arqueo.
   */
  async rejectClosing(
    cashRegisterID: string,
    sessionID: string,
    dto: RejectCashRegisterClosingDto,
    user: JwtPayload | MasterJwtPayload,
  ): Promise<CashRegisterClosing> {
    const tenantID = this.getEffectiveTenantId();

    assertCashApprover(
      user,
      'Solo un supervisor (administrador o jefe de tienda) puede rechazar un arqueo',
    );

    return this.runInTransaction(async (manager) => {
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

      const session = await findSessionOrFail(
        manager,
        sessionID,
        cashRegisterID,
        tenantID,
      );
      const closing = await this.findPendingClosingOrFail(
        manager,
        session.sessionID,
        tenantID,
      );

      closing.status = CashRegisterClosingStatus.REJECTED;
      closing.rejectedByUserID = resolveActingUserId(user);
      closing.rejectedAt = new Date();
      closing.rejectionReason = dto.reason.trim();

      return manager.getRepository(CashRegisterClosing).save(closing);
    });
  }

  async findClosings(
    cashRegisterID: string,
    sessionID: string,
  ): Promise<CashRegisterClosing[]> {
    const tenantID = this.getEffectiveTenantId();

    return this.runInTransaction(async (manager) => {
      await findCashRegisterOrFail(manager, cashRegisterID, tenantID);
      await findSessionOrFail(manager, sessionID, cashRegisterID, tenantID);

      return manager.getRepository(CashRegisterClosing).find({
        where: { tenantID, sessionID },
        order: { startedAt: 'DESC' },
      });
    });
  }
}
