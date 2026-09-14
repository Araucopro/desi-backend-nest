import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
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
import { TenantContextService } from '../multitenant/tenant-context.service';
import { UserstoresService } from '../relations/userstores/userstores.service';
import {
  assertUserCanAccessStore,
  findCashRegisterOrFail,
  findOpenSessionOrFail,
  findSessionOrFail,
  isCashApprover,
  resolveActingUserId,
  sumSessionCashMovements,
  toMoney,
  type SessionCashTotals,
} from './cash-registers.helpers';
import { CashMovementReasonsService } from './cash-movement-reasons.service';
import { CreateCashMovementDto } from './dto/create-cash-movement.dto';
import { QueryCashMovementsDto } from './dto/query-cash-movements.dto';
import { VoidCashMovementDto } from './dto/void-cash-movement.dto';
import {
  CashMovement,
  CashMovementReferenceType,
  CashMovementStatus,
  CashMovementType,
  RESERVED_SYSTEM_CASH_MOVEMENT_REASONS,
} from './entities/cash-movement.entity';

export type SystemCashMovementInput = {
  tenantID: string;
  sessionID: string;
  type: CashMovementType;
  amount: number;
  /** Código de razón: los módulos satélite usan `CashMovementReasonCode`. */
  reason: string;
  referenceType: CashMovementReferenceType;
  referenceID: string | null;
  description?: string | null;
  createdByUserID: string;
};

export type VoidedCashMovementResult = {
  movement: CashMovement;
  reversal: CashMovement;
};

@Injectable()
export class CashMovementsService {
  constructor(
    @InjectRepository(CashMovement)
    private readonly cashMovementRepository: Repository<CashMovement>,
    private readonly userstoresService: UserstoresService,
    private readonly movementReasonsService: CashMovementReasonsService,
    @Optional() private readonly tenantContext?: TenantContextService,
  ) {}

  private runInTransaction<T>(
    callback: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return this.tenantContext
      ? this.tenantContext.transaction(callback)
      : this.cashMovementRepository.manager.transaction(callback);
  }

  private getEffectiveTenantId(): string {
    const tenantId = this.tenantContext?.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('Contexto tenant no disponible');
    }
    return tenantId;
  }

  /**
   * Registra un hecho de efectivo generado por un módulo satélite
   * (`sales`, `returns`, etc.) dentro de la transacción del documento fuente.
   */
  async recordSystemMovement(
    manager: EntityManager,
    input: SystemCashMovementInput,
  ): Promise<CashMovement> {
    const repository = manager.getRepository(CashMovement);
    const movement = repository.create({
      tenantID: input.tenantID,
      sessionID: input.sessionID,
      type: input.type,
      amount: toMoney(input.amount),
      status: CashMovementStatus.POSTED,
      reason: input.reason,
      referenceType: input.referenceType,
      referenceID: input.referenceID,
      description: input.description?.trim() ?? null,
      createdByUserID: input.createdByUserID,
      occurredAt: new Date(),
    });

    return repository.save(movement);
  }

  async sumPosted(
    manager: EntityManager,
    sessionID: string,
  ): Promise<SessionCashTotals> {
    return sumSessionCashMovements(manager, sessionID);
  }

  async listSessionMovements(
    cashRegisterID: string,
    sessionID: string,
    query: QueryCashMovementsDto,
  ): Promise<CashMovement[]> {
    const tenantID = this.getEffectiveTenantId();

    return this.runInTransaction(async (manager) => {
      await findCashRegisterOrFail(manager, cashRegisterID, tenantID);
      await findSessionOrFail(manager, sessionID, cashRegisterID, tenantID);

      const queryBuilder = manager
        .getRepository(CashMovement)
        .createQueryBuilder('movement')
        .where('movement.tenantID = :tenantID', { tenantID })
        .andWhere('movement.sessionID = :sessionID', { sessionID });

      if (query.type) {
        queryBuilder.andWhere('movement.type = :type', { type: query.type });
      }
      if (query.status) {
        queryBuilder.andWhere('movement.status = :status', {
          status: query.status,
        });
      }
      if (query.referenceType) {
        queryBuilder.andWhere('movement.referenceType = :referenceType', {
          referenceType: query.referenceType,
        });
      }
      if (query.from) {
        queryBuilder.andWhere('movement.occurredAt >= :from', {
          from: query.from,
        });
      }
      if (query.to) {
        queryBuilder.andWhere('movement.occurredAt <= :to', { to: query.to });
      }

      return queryBuilder
        .orderBy('movement.occurredAt', 'DESC')
        .addOrderBy('movement.createdAt', 'DESC')
        .getMany();
    });
  }

  async createManualMovement(
    cashRegisterID: string,
    sessionID: string,
    dto: CreateCashMovementDto,
    user: JwtPayload | MasterJwtPayload,
  ): Promise<CashMovement> {
    const tenantID = this.getEffectiveTenantId();
    const reasonCode = dto.reason.trim().toUpperCase();

    if (RESERVED_SYSTEM_CASH_MOVEMENT_REASONS.includes(reasonCode)) {
      throw new BadRequestException(
        `La razón "${reasonCode}" no puede registrarse manualmente; se genera desde su módulo de origen`,
      );
    }

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

      const session = await findOpenSessionOrFail(manager, cashRegisterID, {
        tenantID,
        lock: true,
      });
      if (session.sessionID !== sessionID) {
        throw new NotFoundException(
          `Sesión con ID ${sessionID} no encontrada para la caja ${cashRegisterID}`,
        );
      }

      // Catálogo configurable del tenant: valida vigencia, sentido y
      // aprobación de supervisor (flag `requiresApproval`).
      const reason = await this.movementReasonsService.getActiveByCodeOrFail(
        manager,
        tenantID,
        reasonCode,
        dto.type,
      );
      if (reason.requiresApproval && !isCashApprover(user)) {
        throw new ForbiddenException(
          `La razón "${reason.name}" requiere aprobación de un supervisor (administrador, jefe de tienda o MASTER)`,
        );
      }

      return this.recordSystemMovement(manager, {
        tenantID,
        sessionID: session.sessionID,
        type: dto.type,
        amount: dto.amount,
        reason: reason.code,
        referenceType: CashMovementReferenceType.MANUAL,
        referenceID: null,
        description: dto.description ?? null,
        createdByUserID: resolveActingUserId(user),
      });
    });
  }

  /**
   * Anula lógicamente un movimiento y genera el contra-movimiento de
   * compensación (los movimientos financieros no se eliminan nunca).
   */
  async voidMovement(
    cashRegisterID: string,
    sessionID: string,
    cashMovementID: string,
    dto: VoidCashMovementDto,
    user: JwtPayload | MasterJwtPayload,
  ): Promise<VoidedCashMovementResult> {
    const tenantID = this.getEffectiveTenantId();
    const userId = resolveActingUserId(user);

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

      const session = await findOpenSessionOrFail(manager, cashRegisterID, {
        tenantID,
        lock: true,
      });
      if (session.sessionID !== sessionID) {
        throw new NotFoundException(
          `Sesión con ID ${sessionID} no encontrada para la caja ${cashRegisterID}`,
        );
      }

      const repository = manager.getRepository(CashMovement);
      const movement = await repository.findOne({
        where: { cashMovementID, sessionID: session.sessionID, tenantID },
        lock: { mode: 'pessimistic_write' },
      });

      if (!movement) {
        throw new NotFoundException(
          `Movimiento con ID ${cashMovementID} no encontrado en la sesión ${session.sessionID}`,
        );
      }

      if (movement.status !== CashMovementStatus.POSTED) {
        throw new ConflictException(
          `El movimiento ${cashMovementID} ya se encuentra en estado "${movement.status}"`,
        );
      }

      movement.status = CashMovementStatus.VOIDED;
      movement.voidedAt = new Date();
      movement.voidedByUserID = userId;
      movement.voidReason = dto.reason.trim();
      await repository.save(movement);

      const reversal = await this.recordSystemMovement(manager, {
        tenantID,
        sessionID: session.sessionID,
        type:
          movement.type === CashMovementType.CASH_IN
            ? CashMovementType.CASH_OUT
            : CashMovementType.CASH_IN,
        amount: Number(movement.amount),
        reason: movement.reason,
        referenceType: CashMovementReferenceType.CASH_MOVEMENT,
        referenceID: movement.cashMovementID,
        description: `Anulación del movimiento ${movement.cashMovementID}: ${dto.reason.trim()}`,
        createdByUserID: userId,
      });

      return { movement, reversal };
    });
  }
}
