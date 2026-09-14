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
  findCashRegisterOrFail,
  findOpenSessionOrFail,
  findSessionOrFail,
  resolveActingUserId,
  sumSessionCashMovements,
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
import {
  CashPaymentMethodTotal,
  CashRegisterClosing,
  CashRegisterClosingStatus,
} from './entities/cash-register-closing.entity';
import { Payment, PaymentStatus } from './entities/payment.entity';
import { PaymentMethod } from './entities/payment-method.entity';

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
    const paymentMethodTotals = await this.sumSessionPaymentsByMethod(
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

  private async sumSessionPaymentsByMethod(
    manager: EntityManager,
    sessionID: string,
  ): Promise<CashPaymentMethodTotal[]> {
    const rows = await manager
      .getRepository(Payment)
      .createQueryBuilder('payment')
      .innerJoin(
        PaymentMethod,
        'method',
        'method.paymentMethodID = payment.paymentMethodID',
      )
      .select('payment.paymentMethodID', 'paymentMethodID')
      .addSelect('method.code', 'code')
      .addSelect('method.name', 'name')
      .addSelect('method.affectsCash', 'affectsCash')
      .addSelect('COUNT(*)', 'paymentCount')
      .addSelect('COALESCE(SUM(payment.amount), 0)', 'amount')
      .where('payment.sessionID = :sessionID', { sessionID })
      .andWhere('payment.status = :status', {
        status: PaymentStatus.COMPLETED,
      })
      .groupBy('payment.paymentMethodID')
      .addGroupBy('method.code')
      .addGroupBy('method.name')
      .addGroupBy('method.affectsCash')
      .orderBy('method.code', 'ASC')
      .getRawMany<{
        paymentMethodID: string;
        code: string;
        name: string;
        affectsCash: boolean | string;
        paymentCount: string;
        amount: string;
      }>();

    return rows.map((row) => ({
      paymentMethodID: row.paymentMethodID,
      code: row.code,
      name: row.name,
      affectsCash: row.affectsCash === true || row.affectsCash === 'true',
      paymentCount: Number(row.paymentCount ?? 0),
      amount: toMoney(Number(row.amount ?? 0)),
    }));
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
      const snapshot = await this.buildSnapshot(manager, session);
      const countedCashAmount = toMoney(Number(dto.countedCashAmount));

      Object.assign(closing, snapshot);
      closing.countedCashAmount = countedCashAmount;
      closing.cashDifference = toMoney(
        countedCashAmount - snapshot.expectedCashAmount,
      );
      closing.actualTotalAmount = toMoney(
        countedCashAmount + snapshot.expectedNonCashAmount,
      );
      if (dto.notes !== undefined) {
        closing.notes = dto.notes.trim() || null;
      }

      return manager.getRepository(CashRegisterClosing).save(closing);
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

      const closing = await this.findPendingClosingOrFail(
        manager,
        session.sessionID,
        tenantID,
      );
      const snapshot = await this.buildSnapshot(manager, session);
      const countedCashAmount = this.resolveCountedCashAmount(dto, closing);

      if (countedCashAmount === null) {
        throw new BadRequestException(
          'Debe registrar el efectivo contado (countedCashAmount) antes de completar el arqueo',
        );
      }

      const completedAt = new Date();
      Object.assign(closing, snapshot);
      closing.countedCashAmount = countedCashAmount;
      closing.cashDifference = toMoney(
        countedCashAmount - snapshot.expectedCashAmount,
      );
      closing.actualTotalAmount = toMoney(
        countedCashAmount + snapshot.expectedNonCashAmount,
      );
      if (dto.notes !== undefined) {
        closing.notes = dto.notes.trim() || null;
      }
      closing.status = CashRegisterClosingStatus.COMPLETED;
      closing.completedByUserID = userId;
      closing.completedAt = completedAt;

      const savedClosing = await manager
        .getRepository(CashRegisterClosing)
        .save(closing);

      session.expectedCashBalance = snapshot.expectedCashAmount;
      session.countedCashBalance = countedCashAmount;
      session.cashDifference = savedClosing.cashDifference;
      session.closedByUserID = userId;
      session.closedAt = completedAt;
      session.status = CashRegisterSessionStatus.CLOSED;
      session.closingNotes = savedClosing.notes ?? null;
      await manager.getRepository(CashRegisterSession).save(session);

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
