import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import {
  JwtPayload,
  MasterJwtPayload,
} from '../auth/interfaces/jwt-payload.interface';
import {
  DEFAULT_TENANT_TIMEZONE,
  TenantContextService,
} from '../multitenant/tenant-context.service';
import { UserstoresService } from '../relations/userstores/userstores.service';
import {
  assertUserCanAccessStore,
  findCashRegisterOrFail,
  findSessionOrFail,
  findStoreOrFail,
  sumSessionCashMovements,
  sumSessionPaymentsByMethod,
  sumSessionTransferTotals,
  toMoney,
  type SessionTransferTotals,
} from './cash-registers.helpers';
import { QueryStoreCashSummaryDto } from './dto/query-store-cash-summary.dto';
import { CashCount, CashCountStatus } from './entities/cash-count.entity';
import { CashDenominationType } from './entities/cash-denomination.entity';
import {
  CashMovement,
  CashMovementStatus,
  CashMovementType,
} from './entities/cash-movement.entity';
import {
  CashRegister,
  CashRegisterStatus,
} from './entities/cash-register.entity';
import {
  CashPaymentMethodTotal,
  CashRegisterClosing,
} from './entities/cash-register-closing.entity';
import {
  CashRegisterSession,
  CashRegisterSessionStatus,
} from './entities/cash-register-session.entity';
import { CashRegisterSessionUser } from './entities/cash-register-session-user.entity';
import {
  CASH_TRANSFER_OPEN_STATUSES,
  CashTransfer,
  CashTransferDestinationType,
  CashTransferStatus,
} from './entities/cash-transfer.entity';
import { Payment, PaymentStatus } from './entities/payment.entity';
import { PaymentMethod } from './entities/payment-method.entity';

export type CashSessionSummary = {
  session: {
    sessionID: string;
    cashRegisterID: string;
    businessDate: string;
    status: CashRegisterSessionStatus;
    openedByUserID: string;
    closedByUserID: string | null;
    openedAt: Date;
    closedAt: Date | null;
    openingBalance: number;
    expectedCashBalance: number | null;
    countedCashBalance: number | null;
    cashDifference: number | null;
    openingNotes: string | null;
    closingNotes: string | null;
  };
  cashRegister: {
    cashRegisterID: string;
    code: string;
    name: string;
    storeID: string;
    status: CashRegisterStatus;
  };
  cashMovements: {
    cashIn: number;
    cashOut: number;
    net: number;
    movementCount: number;
  };
  payments: {
    paymentCount: number;
    totalAmount: number;
    cashAmount: number;
    nonCashAmount: number;
    byMethod: CashPaymentMethodTotal[];
  };
  transfers: SessionTransferTotals;
  expected: {
    openingBalance: number;
    expectedCashAmount: number;
    expectedNonCashAmount: number;
    expectedTotalAmount: number;
  };
  closing: CashRegisterClosing | null;
  operators: CashRegisterSessionUser[];
  cashCount: {
    cashCountID: string;
    status: CashCountStatus;
    totalAmount: number;
    itemCount: number;
    countedByUserID: string;
    countedAt: Date | null;
    items: Array<{
      cashCountItemID: string;
      denominationID: string;
      denominationValue: number;
      denominationType: CashDenominationType;
      quantity: number;
      subtotal: number;
    }>;
  } | null;
};

export type StoreCashSummaryByDate = {
  businessDate: string;
  sessionCount: number;
  openSessionCount: number;
  closedSessionCount: number;
  openingBalance: number;
  cashIn: number;
  cashOut: number;
  netCash: number;
  paymentTotal: number;
  transfersOutAmount: number;
  transfersInAmount: number;
  expectedCash: number;
  countedCash: number;
  cashDifference: number;
};

export type StoreCashSummaryByRegister = {
  cashRegisterID: string;
  code: string;
  name: string;
  sessionCount: number;
  openSessionCount: number;
  closedSessionCount: number;
  cashIn: number;
  cashOut: number;
  netCash: number;
  paymentTotal: number;
  transfersOutAmount: number;
  transfersInAmount: number;
  expectedCash: number;
  countedCash: number;
  cashDifference: number;
};

export type StoreCashSummaryByOperator = {
  userID: string;
  sessionsAttended: number;
  movementsRegistered: number;
  cashIn: number;
  cashOut: number;
  netCash: number;
  countsPerformed: number;
};

export type StoreCashPendingTransfer = {
  cashTransferID: string;
  status: CashTransferStatus;
  amount: number;
  destinationType: CashTransferDestinationType;
  sourceCashRegisterID: string;
  sourceSessionID: string;
  destinationCashRegisterID: string | null;
  destinationLabel: string | null;
  businessDate: string;
  requestedAt: Date;
  requestedByUserID: string;
};

export type StoreCashSummary = {
  storeID: string;
  from: string;
  to: string;
  sessionCount: number;
  openSessionCount: number;
  closedSessionCount: number;
  openingBalanceTotal: number;
  expectedCashTotal: number;
  countedCashTotal: number;
  cashDifferenceTotal: number;
  cashMovements: {
    cashIn: number;
    cashOut: number;
    net: number;
    movementCount: number;
  };
  payments: {
    paymentCount: number;
    totalAmount: number;
    cashAmount: number;
    nonCashAmount: number;
    byMethod: CashPaymentMethodTotal[];
  };
  transfers: {
    outCount: number;
    outAmount: number;
    toRegisterAmount: number;
    toVaultAmount: number;
    inCount: number;
    inAmount: number;
    pendingCount: number;
    pendingAmount: number;
  };
  byBusinessDate: StoreCashSummaryByDate[];
  byCashRegister: StoreCashSummaryByRegister[];
  byOperator: StoreCashSummaryByOperator[];
  pendingTransfers: StoreCashPendingTransfer[];
};

type RawNumber = string | number | null;

type SessionAggregateRow = {
  sessionID: string;
  cashRegisterID: string;
  registerCode: string;
  registerName: string;
  businessDate: string;
  status: CashRegisterSessionStatus;
  openingBalance: RawNumber;
  expectedCashBalance: RawNumber;
  countedCashBalance: RawNumber;
  cashDifference: RawNumber;
};

type MovementAggregateRow = {
  sessionID: string;
  createdByUserID: string;
  type: CashMovementType;
  amount: RawNumber;
  movementCount: RawNumber;
};

type PaymentAggregateRow = {
  sessionID: string;
  paymentMethodID: string;
  code: string;
  name: string;
  affectsCash: boolean | string;
  amount: RawNumber;
  paymentCount: RawNumber;
};

type TransferOutAggregateRow = {
  sourceSessionID: string;
  status: CashTransferStatus;
  destinationType: CashTransferDestinationType;
  amount: RawNumber;
  transferCount: RawNumber;
};

type TransferInAggregateRow = {
  destinationSessionID: string;
  amount: RawNumber;
  transferCount: RawNumber;
};

type OperatorAggregateRow = {
  userID: string;
  sessionsAttended: RawNumber;
};

type CountAggregateRow = {
  countedByUserID: string;
  count: RawNumber;
};

type PendingTransferRow = {
  cashTransferID: string;
  status: CashTransferStatus;
  amount: RawNumber;
  destinationType: CashTransferDestinationType;
  sourceCashRegisterID: string;
  sourceSessionID: string;
  destinationCashRegisterID: string | null;
  destinationLabel: string | null;
  businessDate: string;
  requestedAt: Date;
  requestedByUserID: string;
};

type SessionAccumulator = {
  cashRegisterID: string;
  registerCode: string;
  registerName: string;
  businessDate: string;
  status: CashRegisterSessionStatus;
  openingBalance: number;
  sealedExpectedCash: number | null;
  countedCash: number;
  cashDifference: number;
  cashIn: number;
  cashOut: number;
  movementCount: number;
  paymentTotal: number;
  paymentCount: number;
  transfersOut: number;
  transfersIn: number;
};

const DEFAULT_SUMMARY_DAYS = 30;

@Injectable()
export class CashReportsService {
  constructor(
    @InjectRepository(CashRegister)
    private readonly cashRegisterRepository: Repository<CashRegister>,
    private readonly userstoresService: UserstoresService,
    @Optional() private readonly tenantContext?: TenantContextService,
  ) {}

  private runInTransaction<T>(
    callback: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return this.tenantContext
      ? this.tenantContext.transaction(callback)
      : this.cashRegisterRepository.manager.transaction(callback);
  }

  private getEffectiveTenantId(): string {
    const tenantId = this.tenantContext?.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('Contexto tenant no disponible');
    }
    return tenantId;
  }

  private getTenantTimeZone(): string {
    return this.tenantContext?.getTimeZone() ?? DEFAULT_TENANT_TIMEZONE;
  }

  /**
   * Resumen de una sesión: saldo esperado, cobros por medio de pago, bitácora
   * de operadores, transferencias de fondos y últimos arqueos/conteos. Es la
   * vista que un supervisor revisa antes de sellar la caja.
   */
  async getSessionSummary(
    cashRegisterID: string,
    sessionID: string,
    user: JwtPayload | MasterJwtPayload,
  ): Promise<CashSessionSummary> {
    const tenantID = this.getEffectiveTenantId();

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

      const cashTotals = await sumSessionCashMovements(
        manager,
        session.sessionID,
      );
      const paymentMethodTotals = await sumSessionPaymentsByMethod(
        manager,
        session.sessionID,
      );
      const transfers = await sumSessionTransferTotals(manager, {
        tenantID,
        sessionID: session.sessionID,
      });

      const closing = await manager.getRepository(CashRegisterClosing).findOne({
        where: { tenantID, sessionID: session.sessionID },
        order: { startedAt: 'DESC' },
      });
      const operators = await manager
        .getRepository(CashRegisterSessionUser)
        .find({
          where: { tenantID, sessionID: session.sessionID },
          order: { enteredAt: 'ASC' },
        });
      const cashCount = await manager.getRepository(CashCount).findOne({
        where: { tenantID, sessionID: session.sessionID },
        relations: ['items'],
        order: { startedAt: 'DESC' },
      });

      const openingBalance = toMoney(Number(session.openingBalance ?? 0));
      const expectedCashAmount = toMoney(openingBalance + cashTotals.net);
      const expectedNonCashAmount = toMoney(
        paymentMethodTotals
          .filter((item) => !item.affectsCash)
          .reduce((accumulator, item) => accumulator + item.amount, 0),
      );
      const paymentTotalAmount = toMoney(
        paymentMethodTotals.reduce(
          (accumulator, item) => accumulator + item.amount,
          0,
        ),
      );
      const cashAmount = toMoney(
        paymentMethodTotals
          .filter((item) => item.affectsCash)
          .reduce((accumulator, item) => accumulator + item.amount, 0),
      );

      return {
        session: {
          sessionID: session.sessionID,
          cashRegisterID: session.cashRegisterID,
          businessDate: session.businessDate,
          status: session.status,
          openedByUserID: session.openedByUserID,
          closedByUserID: session.closedByUserID ?? null,
          openedAt: session.openedAt,
          closedAt: session.closedAt ?? null,
          openingBalance,
          expectedCashBalance:
            session.expectedCashBalance === null ||
            session.expectedCashBalance === undefined
              ? null
              : toMoney(Number(session.expectedCashBalance)),
          countedCashBalance:
            session.countedCashBalance === null ||
            session.countedCashBalance === undefined
              ? null
              : toMoney(Number(session.countedCashBalance)),
          cashDifference:
            session.cashDifference === null ||
            session.cashDifference === undefined
              ? null
              : toMoney(Number(session.cashDifference)),
          openingNotes: session.openingNotes ?? null,
          closingNotes: session.closingNotes ?? null,
        },
        cashRegister: {
          cashRegisterID: register.cashRegisterID,
          code: register.code,
          name: register.name,
          storeID: register.storeID,
          status: register.status,
        },
        cashMovements: {
          cashIn: cashTotals.cashIn,
          cashOut: cashTotals.cashOut,
          net: cashTotals.net,
          movementCount: cashTotals.movementCount,
        },
        payments: {
          paymentCount: paymentMethodTotals.reduce(
            (accumulator, item) => accumulator + item.paymentCount,
            0,
          ),
          totalAmount: paymentTotalAmount,
          cashAmount,
          nonCashAmount: toMoney(paymentTotalAmount - cashAmount),
          byMethod: paymentMethodTotals,
        },
        transfers,
        expected: {
          openingBalance,
          expectedCashAmount,
          expectedNonCashAmount,
          expectedTotalAmount: toMoney(
            expectedCashAmount + expectedNonCashAmount,
          ),
        },
        closing: closing ?? null,
        operators,
        cashCount: cashCount
          ? {
              cashCountID: cashCount.cashCountID,
              status: cashCount.status,
              totalAmount: toMoney(Number(cashCount.totalAmount ?? 0)),
              itemCount: cashCount.itemCount,
              countedByUserID: cashCount.countedByUserID,
              countedAt: cashCount.countedAt ?? null,
              items: [...(cashCount.items ?? [])]
                .sort(
                  (left, right) =>
                    Number(right.denominationValue) -
                    Number(left.denominationValue),
                )
                .map((item) => ({
                  cashCountItemID: item.cashCountItemID,
                  denominationID: item.denominationID,
                  denominationValue: toMoney(
                    Number(item.denominationValue ?? 0),
                  ),
                  denominationType: item.denominationType,
                  quantity: item.quantity,
                  subtotal: toMoney(Number(item.subtotal ?? 0)),
                })),
            }
          : null,
      };
    });
  }

  /**
   * Resumen consolidado de una tienda por rango de fechas contables
   * (`businessDate`): totales, series por día, por caja y por operador, además
   * del colchón de traslados de fondos en curso.
   */
  async getStoreSummary(
    storeID: string,
    query: QueryStoreCashSummaryDto,
    user: JwtPayload | MasterJwtPayload,
  ): Promise<StoreCashSummary> {
    const tenantID = this.getEffectiveTenantId();
    const { from, to } = this.resolveBusinessDateRange(
      query,
      this.getTenantTimeZone(),
    );

    return this.runInTransaction(async (manager) => {
      const store = await findStoreOrFail(manager, storeID, tenantID);
      await assertUserCanAccessStore(
        this.userstoresService,
        user,
        store.storeID,
      );

      const sessionRows = await this.fetchSessionRows(manager, {
        tenantID,
        storeID: store.storeID,
        from,
        to,
      });
      if (!sessionRows.length) {
        return this.buildEmptyStoreSummary(store.storeID, from, to);
      }

      const movementRows = await this.fetchMovementRows(manager, {
        tenantID,
        storeID: store.storeID,
        from,
        to,
      });
      const paymentRows = await this.fetchPaymentRows(manager, {
        tenantID,
        storeID: store.storeID,
        from,
        to,
      });
      const transferOutRows = await this.fetchTransferOutRows(manager, {
        tenantID,
        storeID: store.storeID,
        from,
        to,
      });
      const transferInRows = await this.fetchTransferInRows(manager, {
        tenantID,
        storeID: store.storeID,
        from,
        to,
      });
      const operatorRows = await this.fetchOperatorRows(manager, {
        tenantID,
        storeID: store.storeID,
        from,
        to,
      });
      const countRows = await this.fetchCountRows(manager, {
        tenantID,
        storeID: store.storeID,
        from,
        to,
      });
      const pendingTransfers = await this.fetchPendingTransfers(manager, {
        tenantID,
        storeID: store.storeID,
        from,
        to,
      });

      return this.aggregateStoreSummary({
        storeID: store.storeID,
        from,
        to,
        sessionRows,
        movementRows,
        paymentRows,
        transferOutRows,
        transferInRows,
        operatorRows,
        countRows,
        pendingTransfers,
      });
    });
  }

  private buildEmptyStoreSummary(
    storeID: string,
    from: string,
    to: string,
  ): StoreCashSummary {
    return {
      storeID,
      from,
      to,
      sessionCount: 0,
      openSessionCount: 0,
      closedSessionCount: 0,
      openingBalanceTotal: 0,
      expectedCashTotal: 0,
      countedCashTotal: 0,
      cashDifferenceTotal: 0,
      cashMovements: { cashIn: 0, cashOut: 0, net: 0, movementCount: 0 },
      payments: {
        paymentCount: 0,
        totalAmount: 0,
        cashAmount: 0,
        nonCashAmount: 0,
        byMethod: [],
      },
      transfers: {
        outCount: 0,
        outAmount: 0,
        toRegisterAmount: 0,
        toVaultAmount: 0,
        inCount: 0,
        inAmount: 0,
        pendingCount: 0,
        pendingAmount: 0,
      },
      byBusinessDate: [],
      byCashRegister: [],
      byOperator: [],
      pendingTransfers: [],
    };
  }

  private resolveBusinessDateRange(
    query: QueryStoreCashSummaryDto,
    timeZone: string,
  ): { from: string; to: string } {
    const to =
      this.normalizeBusinessDate(query.to) ?? this.todayInTimeZone(timeZone);
    const from =
      this.normalizeBusinessDate(query.from) ??
      this.addDays(to, -(DEFAULT_SUMMARY_DAYS - 1));

    if (from > to) {
      throw new BadRequestException(
        'El rango contable es inválido: "from" no puede ser posterior a "to"',
      );
    }

    return { from, to };
  }

  private normalizeBusinessDate(value?: string): string | undefined {
    if (!value) return undefined;

    const normalized = value.trim().slice(0, 10);
    const parsed = new Date(`${normalized}T00:00:00.000Z`);
    const isRoundTripValid =
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === normalized;

    if (!isRoundTripValid) {
      throw new BadRequestException(
        `Fecha contable inválida: "${value}" (se espera YYYY-MM-DD)`,
      );
    }

    return normalized;
  }

  private todayInTimeZone(timeZone: string): string {
    const build = (zone: string): string => {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: zone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(new Date());
      const part = (type: string): string =>
        parts.find((item) => item.type === type)?.value ?? '';

      return `${part('year')}-${part('month')}-${part('day')}`;
    };

    try {
      return build(timeZone);
    } catch {
      return build(DEFAULT_TENANT_TIMEZONE);
    }
  }

  private addDays(businessDate: string, days: number): string {
    const base = new Date(`${businessDate}T00:00:00.000Z`);
    base.setUTCDate(base.getUTCDate() + days);

    return base.toISOString().slice(0, 10);
  }

  private async fetchSessionRows(
    manager: EntityManager,
    params: { tenantID: string; storeID: string; from: string; to: string },
  ): Promise<SessionAggregateRow[]> {
    return manager
      .getRepository(CashRegisterSession)
      .createQueryBuilder('session')
      .innerJoin(
        CashRegister,
        'register',
        'register.cashRegisterID = session.cashRegisterID',
      )
      .select('session.sessionID', 'sessionID')
      .addSelect('session.cashRegisterID', 'cashRegisterID')
      .addSelect('register.code', 'registerCode')
      .addSelect('register.name', 'registerName')
      .addSelect(`to_char(session.businessDate, 'YYYY-MM-DD')`, 'businessDate')
      .addSelect('session.status', 'status')
      .addSelect('session.openingBalance', 'openingBalance')
      .addSelect('session.expectedCashBalance', 'expectedCashBalance')
      .addSelect('session.countedCashBalance', 'countedCashBalance')
      .addSelect('session.cashDifference', 'cashDifference')
      .where('session.tenantID = :tenantID', { tenantID: params.tenantID })
      .andWhere('register.storeID = :storeID', { storeID: params.storeID })
      .andWhere('session.businessDate BETWEEN :from AND :to', {
        from: params.from,
        to: params.to,
      })
      .orderBy('session.businessDate', 'ASC')
      .getRawMany<SessionAggregateRow>();
  }

  private async fetchMovementRows(
    manager: EntityManager,
    params: { tenantID: string; storeID: string; from: string; to: string },
  ): Promise<MovementAggregateRow[]> {
    return manager
      .getRepository(CashMovement)
      .createQueryBuilder('movement')
      .innerJoin(
        CashRegisterSession,
        'session',
        'session.sessionID = movement.sessionID',
      )
      .innerJoin(
        CashRegister,
        'register',
        'register.cashRegisterID = session.cashRegisterID',
      )
      .select('movement.sessionID', 'sessionID')
      .addSelect('movement.createdByUserID', 'createdByUserID')
      .addSelect('movement.type', 'type')
      .addSelect('COALESCE(SUM(movement.amount), 0)', 'amount')
      .addSelect('COUNT(*)', 'movementCount')
      .where('movement.tenantID = :tenantID', { tenantID: params.tenantID })
      .andWhere('movement.status = :posted', {
        posted: CashMovementStatus.POSTED,
      })
      .andWhere('register.storeID = :storeID', { storeID: params.storeID })
      .andWhere('session.businessDate BETWEEN :from AND :to', {
        from: params.from,
        to: params.to,
      })
      .groupBy('movement.sessionID')
      .addGroupBy('movement.createdByUserID')
      .addGroupBy('movement.type')
      .getRawMany<MovementAggregateRow>();
  }

  private async fetchPaymentRows(
    manager: EntityManager,
    params: { tenantID: string; storeID: string; from: string; to: string },
  ): Promise<PaymentAggregateRow[]> {
    return manager
      .getRepository(Payment)
      .createQueryBuilder('payment')
      .innerJoin(
        PaymentMethod,
        'method',
        'method.paymentMethodID = payment.paymentMethodID',
      )
      .innerJoin(
        CashRegisterSession,
        'session',
        'session.sessionID = payment.sessionID',
      )
      .innerJoin(
        CashRegister,
        'register',
        'register.cashRegisterID = session.cashRegisterID',
      )
      .select('payment.sessionID', 'sessionID')
      .addSelect('payment.paymentMethodID', 'paymentMethodID')
      .addSelect('method.code', 'code')
      .addSelect('method.name', 'name')
      .addSelect('method.affectsCash', 'affectsCash')
      .addSelect('COALESCE(SUM(payment.amount), 0)', 'amount')
      .addSelect('COUNT(*)', 'paymentCount')
      .where('payment.tenantID = :tenantID', { tenantID: params.tenantID })
      .andWhere('payment.status = :status', { status: PaymentStatus.COMPLETED })
      .andWhere('register.storeID = :storeID', { storeID: params.storeID })
      .andWhere('session.businessDate BETWEEN :from AND :to', {
        from: params.from,
        to: params.to,
      })
      .groupBy('payment.sessionID')
      .addGroupBy('payment.paymentMethodID')
      .addGroupBy('method.code')
      .addGroupBy('method.name')
      .addGroupBy('method.affectsCash')
      .getRawMany<PaymentAggregateRow>();
  }

  private async fetchTransferOutRows(
    manager: EntityManager,
    params: { tenantID: string; storeID: string; from: string; to: string },
  ): Promise<TransferOutAggregateRow[]> {
    return manager
      .getRepository(CashTransfer)
      .createQueryBuilder('transfer')
      .innerJoin(
        CashRegisterSession,
        'session',
        'session.sessionID = transfer.sourceSessionID',
      )
      .innerJoin(
        CashRegister,
        'register',
        'register.cashRegisterID = session.cashRegisterID',
      )
      .select('transfer.sourceSessionID', 'sourceSessionID')
      .addSelect('transfer.status', 'status')
      .addSelect('transfer.destinationType', 'destinationType')
      .addSelect('COALESCE(SUM(transfer.amount), 0)', 'amount')
      .addSelect('COUNT(*)', 'transferCount')
      .where('transfer.tenantID = :tenantID', { tenantID: params.tenantID })
      .andWhere('register.storeID = :storeID', { storeID: params.storeID })
      .andWhere('session.businessDate BETWEEN :from AND :to', {
        from: params.from,
        to: params.to,
      })
      .groupBy('transfer.sourceSessionID')
      .addGroupBy('transfer.status')
      .addGroupBy('transfer.destinationType')
      .getRawMany<TransferOutAggregateRow>();
  }

  private async fetchTransferInRows(
    manager: EntityManager,
    params: { tenantID: string; storeID: string; from: string; to: string },
  ): Promise<TransferInAggregateRow[]> {
    return manager
      .getRepository(CashTransfer)
      .createQueryBuilder('transfer')
      .innerJoin(
        CashRegisterSession,
        'session',
        'session.sessionID = transfer.destinationSessionID',
      )
      .innerJoin(
        CashRegister,
        'register',
        'register.cashRegisterID = session.cashRegisterID',
      )
      .select('transfer.destinationSessionID', 'destinationSessionID')
      .addSelect('COALESCE(SUM(transfer.amount), 0)', 'amount')
      .addSelect('COUNT(*)', 'transferCount')
      .where('transfer.tenantID = :tenantID', { tenantID: params.tenantID })
      .andWhere('transfer.status = :status', {
        status: CashTransferStatus.COMPLETED,
      })
      .andWhere('register.storeID = :storeID', { storeID: params.storeID })
      .andWhere('session.businessDate BETWEEN :from AND :to', {
        from: params.from,
        to: params.to,
      })
      .groupBy('transfer.destinationSessionID')
      .getRawMany<TransferInAggregateRow>();
  }

  private async fetchOperatorRows(
    manager: EntityManager,
    params: { tenantID: string; storeID: string; from: string; to: string },
  ): Promise<OperatorAggregateRow[]> {
    return manager
      .getRepository(CashRegisterSessionUser)
      .createQueryBuilder('sessionUser')
      .innerJoin(
        CashRegisterSession,
        'session',
        'session.sessionID = sessionUser.sessionID',
      )
      .innerJoin(
        CashRegister,
        'register',
        'register.cashRegisterID = session.cashRegisterID',
      )
      .select('sessionUser.userID', 'userID')
      .addSelect('COUNT(DISTINCT sessionUser.sessionID)', 'sessionsAttended')
      .where('sessionUser.tenantID = :tenantID', { tenantID: params.tenantID })
      .andWhere('register.storeID = :storeID', { storeID: params.storeID })
      .andWhere('session.businessDate BETWEEN :from AND :to', {
        from: params.from,
        to: params.to,
      })
      .groupBy('sessionUser.userID')
      .getRawMany<OperatorAggregateRow>();
  }

  private async fetchCountRows(
    manager: EntityManager,
    params: { tenantID: string; storeID: string; from: string; to: string },
  ): Promise<CountAggregateRow[]> {
    return manager
      .getRepository(CashCount)
      .createQueryBuilder('cashCount')
      .innerJoin(
        CashRegisterSession,
        'session',
        'session.sessionID = cashCount.sessionID',
      )
      .innerJoin(
        CashRegister,
        'register',
        'register.cashRegisterID = session.cashRegisterID',
      )
      .select('cashCount.countedByUserID', 'countedByUserID')
      .addSelect('COUNT(*)', 'count')
      .where('cashCount.tenantID = :tenantID', { tenantID: params.tenantID })
      .andWhere('cashCount.status = :status', {
        status: CashCountStatus.COMPLETED,
      })
      .andWhere('register.storeID = :storeID', { storeID: params.storeID })
      .andWhere('session.businessDate BETWEEN :from AND :to', {
        from: params.from,
        to: params.to,
      })
      .groupBy('cashCount.countedByUserID')
      .getRawMany<CountAggregateRow>();
  }

  private async fetchPendingTransfers(
    manager: EntityManager,
    params: { tenantID: string; storeID: string; from: string; to: string },
  ): Promise<StoreCashPendingTransfer[]> {
    const rows = await manager
      .getRepository(CashTransfer)
      .createQueryBuilder('transfer')
      .innerJoin(
        CashRegisterSession,
        'session',
        'session.sessionID = transfer.sourceSessionID',
      )
      .innerJoin(
        CashRegister,
        'register',
        'register.cashRegisterID = session.cashRegisterID',
      )
      .select('transfer.cashTransferID', 'cashTransferID')
      .addSelect('transfer.status', 'status')
      .addSelect('transfer.amount', 'amount')
      .addSelect('transfer.destinationType', 'destinationType')
      .addSelect('transfer.sourceCashRegisterID', 'sourceCashRegisterID')
      .addSelect('transfer.sourceSessionID', 'sourceSessionID')
      .addSelect(
        'transfer.destinationCashRegisterID',
        'destinationCashRegisterID',
      )
      .addSelect('transfer.destinationLabel', 'destinationLabel')
      .addSelect(`to_char(session.businessDate, 'YYYY-MM-DD')`, 'businessDate')
      .addSelect('transfer.requestedAt', 'requestedAt')
      .addSelect('transfer.requestedByUserID', 'requestedByUserID')
      .where('transfer.tenantID = :tenantID', { tenantID: params.tenantID })
      .andWhere('transfer.status IN (:...openStatuses)', {
        openStatuses: [...CASH_TRANSFER_OPEN_STATUSES],
      })
      .andWhere('register.storeID = :storeID', { storeID: params.storeID })
      .andWhere('session.businessDate BETWEEN :from AND :to', {
        from: params.from,
        to: params.to,
      })
      .orderBy('transfer.requestedAt', 'ASC')
      .getRawMany<PendingTransferRow>();

    return rows.map((row) => ({
      cashTransferID: row.cashTransferID,
      status: row.status,
      amount: toMoney(Number(row.amount ?? 0)),
      destinationType: row.destinationType,
      sourceCashRegisterID: row.sourceCashRegisterID,
      sourceSessionID: row.sourceSessionID,
      destinationCashRegisterID: row.destinationCashRegisterID ?? null,
      destinationLabel: row.destinationLabel ?? null,
      businessDate: row.businessDate,
      requestedAt: row.requestedAt,
      requestedByUserID: row.requestedByUserID,
    }));
  }

  private aggregateStoreSummary(params: {
    storeID: string;
    from: string;
    to: string;
    sessionRows: SessionAggregateRow[];
    movementRows: MovementAggregateRow[];
    paymentRows: PaymentAggregateRow[];
    transferOutRows: TransferOutAggregateRow[];
    transferInRows: TransferInAggregateRow[];
    operatorRows: OperatorAggregateRow[];
    countRows: CountAggregateRow[];
    pendingTransfers: StoreCashPendingTransfer[];
  }): StoreCashSummary {
    const sessions = new Map<string, SessionAccumulator>();
    for (const row of params.sessionRows) {
      sessions.set(row.sessionID, {
        cashRegisterID: row.cashRegisterID,
        registerCode: row.registerCode,
        registerName: row.registerName,
        businessDate: row.businessDate,
        status: row.status,
        openingBalance: this.numberFrom(row.openingBalance),
        sealedExpectedCash:
          row.expectedCashBalance === null ||
          row.expectedCashBalance === undefined
            ? null
            : this.numberFrom(row.expectedCashBalance),
        countedCash: this.numberFrom(row.countedCashBalance),
        cashDifference: this.numberFrom(row.cashDifference),
        cashIn: 0,
        cashOut: 0,
        movementCount: 0,
        paymentTotal: 0,
        paymentCount: 0,
        transfersOut: 0,
        transfersIn: 0,
      });
    }

    let cashIn = 0;
    let cashOut = 0;
    let movementCount = 0;
    for (const row of params.movementRows) {
      const amount = this.numberFrom(row.amount);
      const count = this.numberFrom(row.movementCount);
      const isCashIn = row.type === CashMovementType.CASH_IN;

      movementCount += count;
      if (isCashIn) {
        cashIn += amount;
      } else {
        cashOut += amount;
      }

      const session = sessions.get(row.sessionID);
      if (!session) continue;

      session.movementCount += count;
      if (isCashIn) {
        session.cashIn += amount;
      } else {
        session.cashOut += amount;
      }
    }

    const byMethod = new Map<string, CashPaymentMethodTotal>();
    let paymentCount = 0;
    let paymentTotal = 0;
    for (const row of params.paymentRows) {
      const amount = this.numberFrom(row.amount);
      const count = this.numberFrom(row.paymentCount);
      const affectsCash =
        row.affectsCash === true || row.affectsCash === 'true';

      paymentCount += count;
      paymentTotal += amount;

      const existing = byMethod.get(row.paymentMethodID);
      if (existing) {
        existing.amount = toMoney(existing.amount + amount);
        existing.paymentCount += count;
      } else {
        byMethod.set(row.paymentMethodID, {
          paymentMethodID: row.paymentMethodID,
          code: row.code,
          name: row.name,
          affectsCash,
          amount: toMoney(amount),
          paymentCount: count,
        });
      }

      const session = sessions.get(row.sessionID);
      if (!session) continue;

      session.paymentTotal += amount;
      session.paymentCount += count;
    }

    let transfersOutAmount = 0;
    let transfersOutCount = 0;
    let transfersToRegisterAmount = 0;
    let transfersToVaultAmount = 0;
    let transfersPendingCount = 0;
    let transfersPendingAmount = 0;
    for (const row of params.transferOutRows) {
      const amount = this.numberFrom(row.amount);
      const count = this.numberFrom(row.transferCount);

      if (row.status !== CashTransferStatus.COMPLETED) {
        transfersPendingCount += count;
        transfersPendingAmount += amount;
        continue;
      }

      transfersOutCount += count;
      transfersOutAmount += amount;
      if (row.destinationType === CashTransferDestinationType.CASH_REGISTER) {
        transfersToRegisterAmount += amount;
      } else {
        transfersToVaultAmount += amount;
      }

      const session = sessions.get(row.sourceSessionID);
      if (session) session.transfersOut += amount;
    }

    let transfersInAmount = 0;
    let transfersInCount = 0;
    for (const row of params.transferInRows) {
      const amount = this.numberFrom(row.amount);
      transfersInAmount += amount;
      transfersInCount += this.numberFrom(row.transferCount);

      const session = sessions.get(row.destinationSessionID);
      if (session) session.transfersIn += amount;
    }

    const dateBuckets = new Map<string, StoreCashSummaryByDate>();
    const registerBuckets = new Map<string, StoreCashSummaryByRegister>();
    let openSessionCount = 0;
    let closedSessionCount = 0;
    let openingBalanceTotal = 0;
    let expectedCashTotal = 0;
    let countedCashTotal = 0;
    let cashDifferenceTotal = 0;

    for (const session of sessions.values()) {
      const expectedCash =
        session.sealedExpectedCash ??
        toMoney(session.openingBalance + session.cashIn - session.cashOut);

      openingBalanceTotal += session.openingBalance;
      expectedCashTotal += expectedCash;
      countedCashTotal += session.countedCash;
      cashDifferenceTotal += session.cashDifference;

      const isOpen = session.status === CashRegisterSessionStatus.OPEN;
      if (isOpen) {
        openSessionCount += 1;
      } else {
        closedSessionCount += 1;
      }

      const dateBucket = dateBuckets.get(session.businessDate) ?? {
        businessDate: session.businessDate,
        sessionCount: 0,
        openSessionCount: 0,
        closedSessionCount: 0,
        openingBalance: 0,
        cashIn: 0,
        cashOut: 0,
        netCash: 0,
        paymentTotal: 0,
        transfersOutAmount: 0,
        transfersInAmount: 0,
        expectedCash: 0,
        countedCash: 0,
        cashDifference: 0,
      };
      dateBuckets.set(session.businessDate, dateBucket);

      const registerBucket = registerBuckets.get(session.cashRegisterID) ?? {
        cashRegisterID: session.cashRegisterID,
        code: session.registerCode,
        name: session.registerName,
        sessionCount: 0,
        openSessionCount: 0,
        closedSessionCount: 0,
        cashIn: 0,
        cashOut: 0,
        netCash: 0,
        paymentTotal: 0,
        transfersOutAmount: 0,
        transfersInAmount: 0,
        expectedCash: 0,
        countedCash: 0,
        cashDifference: 0,
      };
      registerBuckets.set(session.cashRegisterID, registerBucket);

      for (const bucket of [dateBucket, registerBucket]) {
        bucket.sessionCount += 1;
        if (isOpen) {
          bucket.openSessionCount += 1;
        } else {
          bucket.closedSessionCount += 1;
        }
        bucket.cashIn += session.cashIn;
        bucket.cashOut += session.cashOut;
        bucket.paymentTotal += session.paymentTotal;
        bucket.transfersOutAmount += session.transfersOut;
        bucket.transfersInAmount += session.transfersIn;
        bucket.expectedCash += expectedCash;
        bucket.countedCash += session.countedCash;
        bucket.cashDifference += session.cashDifference;
      }
      dateBucket.openingBalance += session.openingBalance;
    }

    const operators = new Map<string, StoreCashSummaryByOperator>();
    const ensureOperator = (userID: string): StoreCashSummaryByOperator => {
      const existing = operators.get(userID);
      if (existing) return existing;

      const created: StoreCashSummaryByOperator = {
        userID,
        sessionsAttended: 0,
        movementsRegistered: 0,
        cashIn: 0,
        cashOut: 0,
        netCash: 0,
        countsPerformed: 0,
      };
      operators.set(userID, created);

      return created;
    };

    for (const row of params.movementRows) {
      const operator = ensureOperator(row.createdByUserID);
      const amount = this.numberFrom(row.amount);

      operator.movementsRegistered += this.numberFrom(row.movementCount);
      if (row.type === CashMovementType.CASH_IN) {
        operator.cashIn += amount;
      } else {
        operator.cashOut += amount;
      }
    }
    for (const row of params.operatorRows) {
      ensureOperator(row.userID).sessionsAttended = this.numberFrom(
        row.sessionsAttended,
      );
    }
    for (const row of params.countRows) {
      ensureOperator(row.countedByUserID).countsPerformed = this.numberFrom(
        row.count,
      );
    }

    for (const bucket of dateBuckets.values()) this.roundBucket(bucket);
    for (const bucket of registerBuckets.values()) this.roundBucket(bucket);

    return {
      storeID: params.storeID,
      from: params.from,
      to: params.to,
      sessionCount: sessions.size,
      openSessionCount,
      closedSessionCount,
      openingBalanceTotal: toMoney(openingBalanceTotal),
      expectedCashTotal: toMoney(expectedCashTotal),
      countedCashTotal: toMoney(countedCashTotal),
      cashDifferenceTotal: toMoney(cashDifferenceTotal),
      cashMovements: {
        cashIn: toMoney(cashIn),
        cashOut: toMoney(cashOut),
        net: toMoney(cashIn - cashOut),
        movementCount,
      },
      payments: {
        paymentCount,
        totalAmount: toMoney(paymentTotal),
        cashAmount: toMoney(
          [...byMethod.values()]
            .filter((item) => item.affectsCash)
            .reduce((accumulator, item) => accumulator + item.amount, 0),
        ),
        nonCashAmount: toMoney(
          [...byMethod.values()]
            .filter((item) => !item.affectsCash)
            .reduce((accumulator, item) => accumulator + item.amount, 0),
        ),
        byMethod: [...byMethod.values()].sort((left, right) =>
          left.code.localeCompare(right.code),
        ),
      },
      transfers: {
        outCount: transfersOutCount,
        outAmount: toMoney(transfersOutAmount),
        toRegisterAmount: toMoney(transfersToRegisterAmount),
        toVaultAmount: toMoney(transfersToVaultAmount),
        inCount: transfersInCount,
        inAmount: toMoney(transfersInAmount),
        pendingCount: transfersPendingCount,
        pendingAmount: toMoney(transfersPendingAmount),
      },
      byBusinessDate: [...dateBuckets.values()].sort((left, right) =>
        left.businessDate.localeCompare(right.businessDate),
      ),
      byCashRegister: [...registerBuckets.values()].sort((left, right) =>
        left.code.localeCompare(right.code),
      ),
      byOperator: [...operators.values()]
        .map((operator) => ({
          ...operator,
          cashIn: toMoney(operator.cashIn),
          cashOut: toMoney(operator.cashOut),
          netCash: toMoney(operator.cashIn - operator.cashOut),
        }))
        .sort((left, right) => left.userID.localeCompare(right.userID)),
      pendingTransfers: params.pendingTransfers,
    };
  }

  private numberFrom(value: RawNumber): number {
    return Number(value ?? 0);
  }

  /** Redondea los acumuladores monetarios de un bucket y computa su neto. */
  private roundBucket(bucket: {
    cashIn: number;
    cashOut: number;
    netCash: number;
    paymentTotal: number;
    transfersOutAmount: number;
    transfersInAmount: number;
    expectedCash: number;
    countedCash: number;
    cashDifference: number;
  }): void {
    bucket.cashIn = toMoney(bucket.cashIn);
    bucket.cashOut = toMoney(bucket.cashOut);
    bucket.netCash = toMoney(bucket.cashIn - bucket.cashOut);
    bucket.paymentTotal = toMoney(bucket.paymentTotal);
    bucket.transfersOutAmount = toMoney(bucket.transfersOutAmount);
    bucket.transfersInAmount = toMoney(bucket.transfersInAmount);
    bucket.expectedCash = toMoney(bucket.expectedCash);
    bucket.countedCash = toMoney(bucket.countedCash);
    bucket.cashDifference = toMoney(bucket.cashDifference);
  }
}
