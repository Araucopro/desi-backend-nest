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
  assertCashApprover,
  assertUserCanAccessStore,
  findCashRegisterOrFail,
  findOpenSessionOrFail,
  findSessionOrFail,
  isCashApprover,
  resolveActingUserId,
  resolveSessionExpectedCash,
  toMoney,
} from './cash-registers.helpers';
import { CashMovementsService } from './cash-movements.service';
import { ApproveCashTransferDto } from './dto/approve-cash-transfer.dto';
import { CancelCashTransferDto } from './dto/cancel-cash-transfer.dto';
import { CompleteCashTransferDto } from './dto/complete-cash-transfer.dto';
import { CreateCashTransferDto } from './dto/create-cash-transfer.dto';
import {
  CashTransferDirection,
  QueryCashTransfersDto,
} from './dto/query-cash-transfers.dto';
import { RejectCashTransferDto } from './dto/reject-cash-transfer.dto';
import {
  CASH_TRANSFER_OPEN_STATUSES,
  CashTransfer,
  CashTransferDestinationType,
  CashTransferStatus,
  DEFAULT_CASH_TRANSFER_VAULT_LABEL,
} from './entities/cash-transfer.entity';
import {
  CashMovementReasonCode,
  CashMovementReferenceType,
  CashMovementType,
} from './entities/cash-movement.entity';
import {
  CashRegister,
  CashRegisterStatus,
} from './entities/cash-register.entity';
import { CashRegisterSession } from './entities/cash-register-session.entity';

/** Margen de tolerancia para `occurredAt` frente al reloj del servidor. */
const TRANSFER_CLOCK_SKEW_MS = 60_000;

@Injectable()
export class CashTransfersService {
  constructor(
    @InjectRepository(CashTransfer)
    private readonly cashTransferRepository: Repository<CashTransfer>,
    private readonly userstoresService: UserstoresService,
    private readonly cashMovementsService: CashMovementsService,
    @Optional() private readonly tenantContext?: TenantContextService,
  ) {}

  private runInTransaction<T>(
    callback: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return this.tenantContext
      ? this.tenantContext.transaction(callback)
      : this.cashTransferRepository.manager.transaction(callback);
  }

  private getEffectiveTenantId(): string {
    const tenantId = this.tenantContext?.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('Contexto tenant no disponible');
    }
    return tenantId;
  }

  /**
   * Valida caja de origen, pertenencia de tienda del usuario y sesión abierta
   * cuyo ID coincide con la ruta. La sesión se bloquea para serializar la
   * transferencia con cobros, movimientos y cierre concurrentes.
   */
  private async resolveOpenSession(
    manager: EntityManager,
    cashRegisterID: string,
    sessionID: string,
    user: JwtPayload | MasterJwtPayload,
    tenantID: string,
  ): Promise<{ register: CashRegister; session: CashRegisterSession }> {
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

    return { register, session };
  }

  /**
   * Valida caja, acceso del usuario y existencia de la sesión sin exigir que
   * siga abierta: rechazar o cancelar un traslado en curso debe seguir siendo
   * posible aunque la caja se haya cerrado antes de resolverlo.
   */
  private async resolveSessionForRead(
    manager: EntityManager,
    cashRegisterID: string,
    sessionID: string,
    user: JwtPayload | MasterJwtPayload,
    tenantID: string,
  ): Promise<{ register: CashRegister; session: CashRegisterSession }> {
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

    return { register, session };
  }

  private async findTransferOrFail(
    manager: EntityManager,
    params: {
      tenantID: string;
      transferID: string;
      sessionID: string;
      sourceOnly?: boolean;
      lock?: boolean;
    },
  ): Promise<CashTransfer> {
    const transfer = await manager.getRepository(CashTransfer).findOne({
      where: { cashTransferID: params.transferID, tenantID: params.tenantID },
      ...(params.lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });

    if (!transfer) {
      throw new NotFoundException(
        `Transferencia con ID ${params.transferID} no encontrada`,
      );
    }

    if (params.sourceOnly) {
      if (transfer.sourceSessionID !== params.sessionID) {
        throw new BadRequestException(
          `La transferencia ${params.transferID} no pertenece a la sesión de origen ${params.sessionID}`,
        );
      }
      return transfer;
    }

    const touchesSession =
      transfer.sourceSessionID === params.sessionID ||
      transfer.destinationSessionID === params.sessionID;

    if (!touchesSession) {
      throw new NotFoundException(
        `Transferencia con ID ${params.transferID} no encontrada en la sesión ${params.sessionID}`,
      );
    }

    return transfer;
  }

  private assertTransferInProgress(
    transfer: CashTransfer,
    action: string,
  ): void {
    if (!CASH_TRANSFER_OPEN_STATUSES.includes(transfer.status)) {
      throw new ConflictException(
        `No se puede ${action} la transferencia ${transfer.cashTransferID}: su estado actual es "${transfer.status}"`,
      );
    }
  }

  private describeDestination(transfer: CashTransfer): string {
    if (
      transfer.destinationType === CashTransferDestinationType.CASH_REGISTER
    ) {
      return `la caja destino ${transfer.destinationCashRegisterID}`;
    }

    return (
      transfer.destinationLabel?.trim() || DEFAULT_CASH_TRANSFER_VAULT_LABEL
    );
  }

  /**
   * Solicita un traslado de efectivo desde la sesión abierta. La transferencia
   * nace `PENDING`: todavía no genera movimientos ni altera el saldo esperado de
   * la caja hasta que un supervisor la apruebe y se complete.
   */
  async create(
    cashRegisterID: string,
    sessionID: string,
    dto: CreateCashTransferDto,
    user: JwtPayload | MasterJwtPayload,
  ): Promise<CashTransfer> {
    const tenantID = this.getEffectiveTenantId();

    return this.runInTransaction(async (manager) => {
      const { register, session } = await this.resolveOpenSession(
        manager,
        cashRegisterID,
        sessionID,
        user,
        tenantID,
      );

      let destinationCashRegisterID: string | null = null;
      let destinationLabel: string | null = null;

      if (dto.destinationType === CashTransferDestinationType.CASH_REGISTER) {
        if (!dto.destinationCashRegisterID) {
          throw new BadRequestException(
            'destinationCashRegisterID es obligatorio cuando destinationType = CASH_REGISTER',
          );
        }
        if (dto.destinationCashRegisterID === register.cashRegisterID) {
          throw new BadRequestException(
            'La caja destino debe ser distinta de la caja de origen',
          );
        }

        const destinationRegister = await findCashRegisterOrFail(
          manager,
          dto.destinationCashRegisterID,
          tenantID,
        );
        if (destinationRegister.status !== CashRegisterStatus.ACTIVE) {
          throw new BadRequestException(
            `La caja destino está en estado "${destinationRegister.status}": solo se puede transferir efectivo a cajas ACTIVE`,
          );
        }
        await assertUserCanAccessStore(
          this.userstoresService,
          user,
          destinationRegister.storeID,
        );

        destinationCashRegisterID = destinationRegister.cashRegisterID;
      } else {
        destinationLabel =
          dto.destinationLabel?.trim() || DEFAULT_CASH_TRANSFER_VAULT_LABEL;
      }

      const repository = manager.getRepository(CashTransfer);
      const transfer = repository.create({
        tenantID,
        storeID: register.storeID,
        sourceCashRegisterID: register.cashRegisterID,
        sourceSessionID: session.sessionID,
        destinationType: dto.destinationType,
        destinationCashRegisterID,
        destinationSessionID: null,
        destinationLabel,
        amount: toMoney(Number(dto.amount)),
        status: CashTransferStatus.PENDING,
        requestedByUserID: resolveActingUserId(user),
        requestedAt: new Date(),
        notes: dto.notes?.trim() ?? null,
      });

      return repository.save(transfer);
    });
  }

  /**
   * Aprueba una solicitud de traslado (revisión de supervisor). La transferencia
   * queda `APPROVED` y el efectivo todavía no se mueve.
   */
  async approve(
    cashRegisterID: string,
    sessionID: string,
    transferID: string,
    dto: ApproveCashTransferDto | undefined,
    user: JwtPayload | MasterJwtPayload,
  ): Promise<CashTransfer> {
    const tenantID = this.getEffectiveTenantId();

    assertCashApprover(
      user,
      'Solo un supervisor (administrador, jefe de tienda o MASTER) puede aprobar una transferencia de fondos',
    );

    return this.runInTransaction(async (manager) => {
      await this.resolveOpenSession(
        manager,
        cashRegisterID,
        sessionID,
        user,
        tenantID,
      );

      const transfer = await this.findTransferOrFail(manager, {
        tenantID,
        transferID,
        sessionID,
        sourceOnly: true,
        lock: true,
      });
      this.assertTransferInProgress(transfer, 'aprobar');

      transfer.status = CashTransferStatus.APPROVED;
      transfer.approvedByUserID = resolveActingUserId(user);
      transfer.approvedAt = new Date();
      const approvalNotes = dto?.notes?.trim();
      if (approvalNotes) {
        transfer.approvalNotes = approvalNotes;
      }

      return manager.getRepository(CashTransfer).save(transfer);
    });
  }

  /**
   * Ejecuta el traslado: descuenta el efectivo de la sesión de origen y, si el
   * destino es otra caja, lo ingresa a su sesión abierta. Ambos movimientos
   * apuntan a la transferencia (`referenceType: CASH_TRANSFER`).
   *
   * Un supervisor puede completar directamente una transferencia `PENDING`: en
   * ese caso la aprobación queda registrada en el mismo acto.
   */
  async complete(
    cashRegisterID: string,
    sessionID: string,
    transferID: string,
    dto: CompleteCashTransferDto | undefined,
    user: JwtPayload | MasterJwtPayload,
  ): Promise<CashTransfer> {
    const tenantID = this.getEffectiveTenantId();
    const userId = resolveActingUserId(user);
    const now = new Date();
    const occurredAt = dto?.occurredAt ? new Date(dto.occurredAt) : now;

    return this.runInTransaction(async (manager) => {
      const { register: sourceRegister, session: sourceSession } =
        await this.resolveOpenSession(
          manager,
          cashRegisterID,
          sessionID,
          user,
          tenantID,
        );

      const transfer = await this.findTransferOrFail(manager, {
        tenantID,
        transferID,
        sessionID,
        sourceOnly: true,
        lock: true,
      });
      this.assertTransferInProgress(transfer, 'completar');

      if (transfer.status === CashTransferStatus.PENDING) {
        assertCashApprover(
          user,
          'La transferencia está pendiente de aprobación: solo un supervisor puede completarla',
        );
        transfer.approvedByUserID = userId;
        transfer.approvedAt = now;
      }

      const requestedAt = new Date(transfer.requestedAt);
      if (occurredAt.getTime() < requestedAt.getTime()) {
        throw new BadRequestException(
          'occurredAt no puede ser anterior a la solicitud de la transferencia',
        );
      }
      if (occurredAt.getTime() > now.getTime() + TRANSFER_CLOCK_SKEW_MS) {
        throw new BadRequestException(
          'occurredAt no puede ser una fecha futura',
        );
      }

      // El efectivo nunca entra a una caja cerrada: la sesión destino se
      // resuelve y bloquea al momento de ejecutar el traslado.
      let destinationSession: CashRegisterSession | null = null;
      if (
        transfer.destinationType === CashTransferDestinationType.CASH_REGISTER
      ) {
        const destinationRegisterID = transfer.destinationCashRegisterID;
        if (!destinationRegisterID) {
          throw new BadRequestException(
            'La transferencia no tiene caja destino definida',
          );
        }

        const destinationRegister = await findCashRegisterOrFail(
          manager,
          destinationRegisterID,
          tenantID,
        );
        await assertUserCanAccessStore(
          this.userstoresService,
          user,
          destinationRegister.storeID,
        );

        destinationSession = await findOpenSessionOrFail(
          manager,
          destinationRegisterID,
          { tenantID, lock: true },
        );
        if (destinationSession.sessionID === sourceSession.sessionID) {
          throw new BadRequestException(
            'La sesión destino no puede ser la misma que la sesión de origen',
          );
        }
      }

      // Una caja no puede entregar más efectivo del que tiene.
      const amount = toMoney(Number(transfer.amount));
      const availableCash = await resolveSessionExpectedCash(
        manager,
        sourceSession,
      );
      if (amount > availableCash) {
        throw new BadRequestException(
          `El monto solicitado (${amount}) supera el efectivo esperado en la caja (${availableCash})`,
        );
      }

      const sourceMovement =
        await this.cashMovementsService.recordSystemMovement(manager, {
          tenantID,
          sessionID: sourceSession.sessionID,
          type: CashMovementType.CASH_OUT,
          amount,
          reason: CashMovementReasonCode.CASH_TRANSFER,
          referenceType: CashMovementReferenceType.CASH_TRANSFER,
          referenceID: transfer.cashTransferID,
          description: `Transferencia ${transfer.cashTransferID} hacia ${this.describeDestination(transfer)}`,
          createdByUserID: userId,
          occurredAt,
        });
      transfer.sourceMovementID = sourceMovement.cashMovementID;

      if (destinationSession) {
        const destinationMovement =
          await this.cashMovementsService.recordSystemMovement(manager, {
            tenantID,
            sessionID: destinationSession.sessionID,
            type: CashMovementType.CASH_IN,
            amount,
            reason: CashMovementReasonCode.CASH_TRANSFER,
            referenceType: CashMovementReferenceType.CASH_TRANSFER,
            referenceID: transfer.cashTransferID,
            description: `Transferencia ${transfer.cashTransferID} recibida desde la caja ${sourceRegister.code}`,
            createdByUserID: userId,
            occurredAt,
          });
        transfer.destinationSessionID = destinationSession.sessionID;
        transfer.destinationMovementID = destinationMovement.cashMovementID;
      }

      transfer.status = CashTransferStatus.COMPLETED;
      transfer.completedByUserID = userId;
      transfer.completedAt = now;
      transfer.occurredAt = occurredAt;

      return manager.getRepository(CashTransfer).save(transfer);
    });
  }

  /**
   * Rechaza una solicitud o aprobación sin mover efectivo (revisión de
   * supervisor).
   */
  async reject(
    cashRegisterID: string,
    sessionID: string,
    transferID: string,
    dto: RejectCashTransferDto,
    user: JwtPayload | MasterJwtPayload,
  ): Promise<CashTransfer> {
    const tenantID = this.getEffectiveTenantId();

    assertCashApprover(
      user,
      'Solo un supervisor (administrador, jefe de tienda o MASTER) puede rechazar una transferencia de fondos',
    );

    return this.runInTransaction(async (manager) => {
      await this.resolveSessionForRead(
        manager,
        cashRegisterID,
        sessionID,
        user,
        tenantID,
      );

      const transfer = await this.findTransferOrFail(manager, {
        tenantID,
        transferID,
        sessionID,
        sourceOnly: true,
        lock: true,
      });
      this.assertTransferInProgress(transfer, 'rechazar');

      transfer.status = CashTransferStatus.REJECTED;
      transfer.rejectedByUserID = resolveActingUserId(user);
      transfer.rejectedAt = new Date();
      transfer.rejectionReason = dto.reason.trim();

      return manager.getRepository(CashTransfer).save(transfer);
    });
  }

  /**
   * Cancela una solicitud o aprobación sin mover efectivo. Puede hacerlo quien
   * la solicitó o un supervisor.
   */
  async cancel(
    cashRegisterID: string,
    sessionID: string,
    transferID: string,
    dto: CancelCashTransferDto,
    user: JwtPayload | MasterJwtPayload,
  ): Promise<CashTransfer> {
    const tenantID = this.getEffectiveTenantId();
    const userId = resolveActingUserId(user);

    return this.runInTransaction(async (manager) => {
      await this.resolveSessionForRead(
        manager,
        cashRegisterID,
        sessionID,
        user,
        tenantID,
      );

      const transfer = await this.findTransferOrFail(manager, {
        tenantID,
        transferID,
        sessionID,
        sourceOnly: true,
        lock: true,
      });
      this.assertTransferInProgress(transfer, 'cancelar');

      if (transfer.requestedByUserID !== userId && !isCashApprover(user)) {
        throw new ForbiddenException(
          'Solo quien solicitó la transferencia o un supervisor pueden cancelarla',
        );
      }

      transfer.status = CashTransferStatus.CANCELLED;
      transfer.cancelledByUserID = userId;
      transfer.cancelledAt = new Date();
      transfer.cancellationReason = dto.reason.trim();

      return manager.getRepository(CashTransfer).save(transfer);
    });
  }

  async findAll(
    cashRegisterID: string,
    sessionID: string,
    query: QueryCashTransfersDto,
    user: JwtPayload | MasterJwtPayload,
  ): Promise<CashTransfer[]> {
    const tenantID = this.getEffectiveTenantId();

    if (query.from && query.to && query.from > query.to) {
      throw new BadRequestException(
        'El rango solicitado es inválido: "from" no puede ser posterior a "to"',
      );
    }

    return this.runInTransaction(async (manager) => {
      await this.resolveSessionForRead(
        manager,
        cashRegisterID,
        sessionID,
        user,
        tenantID,
      );

      const direction = query.direction ?? CashTransferDirection.SENT;
      const queryBuilder = manager
        .getRepository(CashTransfer)
        .createQueryBuilder('transfer')
        .where('transfer.tenantID = :tenantID', { tenantID });

      if (direction === CashTransferDirection.SENT) {
        queryBuilder.andWhere('transfer.sourceSessionID = :sessionID', {
          sessionID,
        });
      } else if (direction === CashTransferDirection.RECEIVED) {
        queryBuilder.andWhere('transfer.destinationSessionID = :sessionID', {
          sessionID,
        });
      } else {
        queryBuilder.andWhere(
          '(transfer.sourceSessionID = :sessionID OR transfer.destinationSessionID = :sessionID)',
          { sessionID },
        );
      }

      if (query.status) {
        queryBuilder.andWhere('transfer.status = :status', {
          status: query.status,
        });
      }
      if (query.destinationType) {
        queryBuilder.andWhere('transfer.destinationType = :destinationType', {
          destinationType: query.destinationType,
        });
      }
      if (query.from) {
        queryBuilder.andWhere('transfer.requestedAt >= :from', {
          from: query.from,
        });
      }
      if (query.to) {
        queryBuilder.andWhere('transfer.requestedAt <= :to', {
          to: query.to,
        });
      }

      return queryBuilder
        .orderBy('transfer.requestedAt', 'DESC')
        .addOrderBy('transfer.createdAt', 'DESC')
        .getMany();
    });
  }

  async findOne(
    cashRegisterID: string,
    sessionID: string,
    transferID: string,
    user: JwtPayload | MasterJwtPayload,
  ): Promise<CashTransfer> {
    const tenantID = this.getEffectiveTenantId();

    return this.runInTransaction(async (manager) => {
      await this.resolveSessionForRead(
        manager,
        cashRegisterID,
        sessionID,
        user,
        tenantID,
      );

      return this.findTransferOrFail(manager, {
        tenantID,
        transferID,
        sessionID,
      });
    });
  }
}
