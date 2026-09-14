import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { TenantContextService } from '../multitenant/tenant-context.service';
import { UserstoresService } from '../relations/userstores/userstores.service';
import { UserRole } from '../users/entities/user.entity';
import { CashReportsService } from './cash-reports.service';
import { CashCount } from './entities/cash-count.entity';
import { CashMovement } from './entities/cash-movement.entity';
import {
  CashRegister,
  CashRegisterStatus,
} from './entities/cash-register.entity';
import { CashRegisterClosing } from './entities/cash-register-closing.entity';
import {
  CashRegisterSession,
  CashRegisterSessionStatus,
} from './entities/cash-register-session.entity';
import { CashRegisterSessionUser } from './entities/cash-register-session-user.entity';
import {
  CashTransfer,
  CashTransferDestinationType,
  CashTransferStatus,
} from './entities/cash-transfer.entity';
import { Payment } from './entities/payment.entity';
import { Store } from '../stores/entities/store.entity';

type QueryBuilderMock = Record<string, jest.Mock>;

const createQueryBuilderMock = (): QueryBuilderMock => {
  const queryBuilder: QueryBuilderMock = {};
  for (const method of [
    'innerJoin',
    'select',
    'addSelect',
    'where',
    'andWhere',
    'setParameters',
    'groupBy',
    'addGroupBy',
    'orderBy',
    'addOrderBy',
  ]) {
    queryBuilder[method] = jest.fn(() => queryBuilder);
  }
  queryBuilder.getRawMany = jest.fn().mockResolvedValue([]);
  queryBuilder.getRawOne = jest.fn().mockResolvedValue({});

  return queryBuilder;
};

describe('CashReportsService (Hito 5)', () => {
  let service: CashReportsService;

  const mockTenantID = 'tenant-uuid-1111';
  const mockStoreID = 'store-uuid-2222';
  const mockRegisterID = 'register-uuid-4444';
  const mockSessionID = 'session-uuid-5555';
  const mockClosedSessionID = 'session-uuid-6666';
  const mockOperatorA = 'user-uuid-aaaa';
  const mockOperatorB = 'user-uuid-bbbb';

  const mockUser: JwtPayload = {
    type: 'tenant',
    userId: mockOperatorA,
    id: mockOperatorA,
    tenantId: mockTenantID,
    sessionVersion: 1,
    email: 'supervisor@arauco.cl',
    role: UserRole.STORE_MANAGER,
  };

  const mockRegisterRepo: { findOne: jest.Mock } = { findOne: jest.fn() };
  const mockStoreRepo: { findOne: jest.Mock } = { findOne: jest.fn() };
  const mockSessionRepo: {
    findOne: jest.Mock;
    createQueryBuilder: jest.Mock;
  } = { findOne: jest.fn(), createQueryBuilder: jest.fn() };
  const mockClosingRepo: { findOne: jest.Mock } = { findOne: jest.fn() };
  const mockSessionUserRepo: {
    find: jest.Mock;
    createQueryBuilder: jest.Mock;
  } = { find: jest.fn(), createQueryBuilder: jest.fn() };
  const mockCountRepo: {
    findOne: jest.Mock;
    createQueryBuilder: jest.Mock;
  } = { findOne: jest.fn(), createQueryBuilder: jest.fn() };

  const sessionQueryBuilder = createQueryBuilderMock();
  const movementQueryBuilder = createQueryBuilderMock();
  const paymentQueryBuilder = createQueryBuilderMock();
  const sessionUserQueryBuilder = createQueryBuilderMock();
  const countQueryBuilder = createQueryBuilderMock();
  const transferQueryBuilders = [
    createQueryBuilderMock(),
    createQueryBuilderMock(),
    createQueryBuilderMock(),
  ];
  let transferQueryBuilderIndex = 0;

  mockSessionRepo.createQueryBuilder.mockImplementation(
    () => sessionQueryBuilder,
  );
  mockSessionUserRepo.createQueryBuilder.mockImplementation(
    () => sessionUserQueryBuilder,
  );
  mockCountRepo.createQueryBuilder.mockImplementation(() => countQueryBuilder);

  const mockMovementRepo: { createQueryBuilder: jest.Mock } = {
    createQueryBuilder: jest.fn(() => movementQueryBuilder),
  };
  const mockPaymentRepo: { createQueryBuilder: jest.Mock } = {
    createQueryBuilder: jest.fn(() => paymentQueryBuilder),
  };
  const mockTransferRepo: { createQueryBuilder: jest.Mock } = {
    createQueryBuilder: jest.fn(
      () =>
        transferQueryBuilders[
          Math.min(
            transferQueryBuilderIndex++,
            transferQueryBuilders.length - 1,
          )
        ],
    ),
  };

  const mockEntityManager: { getRepository: jest.Mock } = {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === CashRegister) return mockRegisterRepo;
      if (entity === Store) return mockStoreRepo;
      if (entity === CashRegisterSession) return mockSessionRepo;
      if (entity === CashMovement) return mockMovementRepo;
      if (entity === Payment) return mockPaymentRepo;
      if (entity === CashTransfer) return mockTransferRepo;
      if (entity === CashRegisterClosing) return mockClosingRepo;
      if (entity === CashRegisterSessionUser) return mockSessionUserRepo;
      if (entity === CashCount) return mockCountRepo;
      return null;
    }),
  };

  const mockUserstoresService = {
    findStoresByUserId: jest
      .fn()
      .mockResolvedValue([{ store: { storeID: mockStoreID } }]),
  };

  const mockTenantContext = {
    getTenantId: jest.fn().mockReturnValue(mockTenantID),
    getTimeZone: jest.fn().mockReturnValue('America/Santiago'),
    transaction: jest.fn((callback: (manager: unknown) => unknown) =>
      callback(mockEntityManager),
    ),
  };

  const buildRegister = (overrides: Record<string, unknown> = {}) => ({
    cashRegisterID: mockRegisterID,
    tenantID: mockTenantID,
    storeID: mockStoreID,
    code: 'CAJA-01',
    name: 'Caja principal',
    status: CashRegisterStatus.ACTIVE,
    ...overrides,
  });

  const buildSession = (overrides: Record<string, unknown> = {}) => ({
    sessionID: mockSessionID,
    tenantID: mockTenantID,
    cashRegisterID: mockRegisterID,
    businessDate: '2026-09-14',
    openedByUserID: mockOperatorA,
    closedByUserID: null,
    openedAt: new Date('2026-09-14T12:00:00.000Z'),
    closedAt: null,
    openingBalance: 50000,
    expectedCashBalance: null,
    countedCashBalance: null,
    cashDifference: null,
    status: CashRegisterSessionStatus.OPEN,
    openingNotes: null,
    closingNotes: null,
    ...overrides,
  });

  const emptyTransferTotals = {
    outCount: '0',
    outAmount: '0',
    toRegisterCount: '0',
    toRegisterAmount: '0',
    toVaultCount: '0',
    toVaultAmount: '0',
    inCount: '0',
    inAmount: '0',
    pendingCount: '0',
    pendingAmount: '0',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockRegisterRepo.findOne.mockReset();
    mockStoreRepo.findOne.mockReset();
    mockSessionRepo.findOne.mockReset();
    mockClosingRepo.findOne.mockReset();
    mockSessionUserRepo.find.mockReset();
    mockCountRepo.findOne.mockReset();
    for (const queryBuilder of [
      sessionQueryBuilder,
      movementQueryBuilder,
      paymentQueryBuilder,
      sessionUserQueryBuilder,
      countQueryBuilder,
      ...transferQueryBuilders,
    ]) {
      queryBuilder.getRawMany.mockReset();
      queryBuilder.getRawOne.mockReset();
      queryBuilder.getRawMany.mockResolvedValue([]);
      queryBuilder.getRawOne.mockResolvedValue({});
    }
    transferQueryBuilderIndex = 0;

    mockRegisterRepo.findOne.mockResolvedValue(buildRegister());
    mockStoreRepo.findOne.mockResolvedValue({
      storeID: mockStoreID,
      tenantID: mockTenantID,
      name: 'Tienda Centro',
    });
    mockSessionRepo.findOne.mockResolvedValue(buildSession());
    mockClosingRepo.findOne.mockResolvedValue(null);
    mockSessionUserRepo.find.mockResolvedValue([]);
    mockCountRepo.findOne.mockResolvedValue(null);
    mockUserstoresService.findStoresByUserId.mockResolvedValue([
      { store: { storeID: mockStoreID } },
    ]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CashReportsService,
        {
          provide: getRepositoryToken(CashRegister),
          useValue: mockRegisterRepo,
        },
        {
          provide: UserstoresService,
          useValue: mockUserstoresService,
        },
        {
          provide: TenantContextService,
          useValue: mockTenantContext,
        },
      ],
    }).compile();

    service = module.get<CashReportsService>(CashReportsService);
  });

  describe('getSessionSummary', () => {
    beforeEach(() => {
      movementQueryBuilder.getRawOne.mockResolvedValue({
        net: '15000',
        cashIn: '20000',
        cashOut: '5000',
        movementCount: '4',
      });
      paymentQueryBuilder.getRawMany.mockResolvedValue([
        {
          paymentMethodID: 'pm-cash',
          code: 'CASH',
          name: 'Efectivo',
          affectsCash: true,
          paymentCount: '1',
          amount: '20000',
        },
        {
          paymentMethodID: 'pm-debit',
          code: 'DEBIT_CARD',
          name: 'Débito',
          affectsCash: false,
          paymentCount: '2',
          amount: '30000',
        },
      ]);
      transferQueryBuilders[0].getRawOne.mockResolvedValue({
        ...emptyTransferTotals,
        outCount: '1',
        outAmount: '25000',
        toVaultCount: '1',
        toVaultAmount: '25000',
        inCount: '1',
        inAmount: '10000',
        pendingCount: '1',
        pendingAmount: '5000',
      });
      mockSessionUserRepo.find.mockResolvedValue([
        {
          sessionUserID: 'session-user-1',
          userID: mockOperatorA,
          role: 'OPERATOR',
          enteredAt: new Date('2026-09-14T12:00:00.000Z'),
          leftAt: null,
        },
      ]);
    });

    it('debe consolidar saldo esperado, cobros, transferencias y arqueo de la sesión', async () => {
      mockClosingRepo.findOne.mockResolvedValue({
        closingID: 'closing-1',
        status: 'COMPLETED',
        expectedCashAmount: 65000,
        countedCashAmount: 64000,
        cashDifference: -1000,
      });
      mockCountRepo.findOne.mockResolvedValue({
        cashCountID: 'count-1',
        status: 'COMPLETED',
        totalAmount: 64000,
        itemCount: 2,
        countedByUserID: mockOperatorA,
        countedAt: new Date('2026-09-14T20:00:00.000Z'),
        items: [
          {
            cashCountItemID: 'item-coin',
            denominationID: 'denomination-500',
            denominationValue: 500,
            denominationType: 'COIN',
            quantity: 8,
            subtotal: 4000,
          },
          {
            cashCountItemID: 'item-banknote',
            denominationID: 'denomination-20000',
            denominationValue: 20000,
            denominationType: 'BANKNOTE',
            quantity: 3,
            subtotal: 60000,
          },
        ],
      });

      const result = await service.getSessionSummary(
        mockRegisterID,
        mockSessionID,
        mockUser,
      );

      expect(result.expected).toEqual({
        openingBalance: 50000,
        expectedCashAmount: 65000,
        expectedNonCashAmount: 30000,
        expectedTotalAmount: 95000,
      });
      expect(result.cashMovements).toEqual({
        cashIn: 20000,
        cashOut: 5000,
        net: 15000,
        movementCount: 4,
      });
      expect(result.payments).toMatchObject({
        paymentCount: 3,
        totalAmount: 50000,
        cashAmount: 20000,
        nonCashAmount: 30000,
      });
      expect(result.transfers).toMatchObject({
        outCount: 1,
        outAmount: 25000,
        toVaultAmount: 25000,
        inCount: 1,
        inAmount: 10000,
        pendingCount: 1,
        pendingAmount: 5000,
      });
      expect(result.operators).toHaveLength(1);
      expect(result.closing).toMatchObject({ closingID: 'closing-1' });
      expect(
        result.cashCount?.items.map((item) => item.denominationValue),
      ).toEqual([20000, 500]);
    });

    it('debe lanzar NotFoundException si la caja no existe en el tenant', async () => {
      mockRegisterRepo.findOne.mockResolvedValue(null);

      await expect(
        service.getSessionSummary(mockRegisterID, mockSessionID, mockUser),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getStoreSummary', () => {
    const buildStoreSummaryData = () => {
      sessionQueryBuilder.getRawMany.mockResolvedValue([
        {
          sessionID: mockSessionID,
          cashRegisterID: mockRegisterID,
          registerCode: 'CAJA-01',
          registerName: 'Caja principal',
          businessDate: '2026-09-01',
          status: CashRegisterSessionStatus.OPEN,
          openingBalance: '50000',
          expectedCashBalance: null,
          countedCashBalance: null,
          cashDifference: null,
        },
        {
          sessionID: mockClosedSessionID,
          cashRegisterID: mockRegisterID,
          registerCode: 'CAJA-01',
          registerName: 'Caja principal',
          businessDate: '2026-09-02',
          status: CashRegisterSessionStatus.CLOSED,
          openingBalance: '30000',
          expectedCashBalance: '45000',
          countedCashBalance: '44000',
          cashDifference: '-1000',
        },
      ]);
      movementQueryBuilder.getRawMany.mockResolvedValue([
        {
          sessionID: mockSessionID,
          createdByUserID: mockOperatorA,
          type: 'CASH_IN',
          amount: '20000',
          movementCount: '2',
        },
        {
          sessionID: mockSessionID,
          createdByUserID: mockOperatorA,
          type: 'CASH_OUT',
          amount: '5000',
          movementCount: '1',
        },
        {
          sessionID: mockClosedSessionID,
          createdByUserID: mockOperatorB,
          type: 'CASH_IN',
          amount: '10000',
          movementCount: '1',
        },
      ]);
      paymentQueryBuilder.getRawMany.mockResolvedValue([
        {
          sessionID: mockSessionID,
          paymentMethodID: 'pm-cash',
          code: 'CASH',
          name: 'Efectivo',
          affectsCash: true,
          paymentCount: '1',
          amount: '20000',
        },
        {
          sessionID: mockSessionID,
          paymentMethodID: 'pm-debit',
          code: 'DEBIT_CARD',
          name: 'Débito',
          affectsCash: false,
          paymentCount: '1',
          amount: '15000',
        },
        {
          sessionID: mockClosedSessionID,
          paymentMethodID: 'pm-cash',
          code: 'CASH',
          name: 'Efectivo',
          affectsCash: true,
          paymentCount: '1',
          amount: '10000',
        },
      ]);
      transferQueryBuilders[0].getRawMany.mockResolvedValue([
        {
          sourceSessionID: mockSessionID,
          status: CashTransferStatus.COMPLETED,
          destinationType: CashTransferDestinationType.VAULT,
          amount: '25000',
          transferCount: '1',
        },
        {
          sourceSessionID: mockSessionID,
          status: CashTransferStatus.PENDING,
          destinationType: CashTransferDestinationType.VAULT,
          amount: '5000',
          transferCount: '1',
        },
      ]);
      transferQueryBuilders[1].getRawMany.mockResolvedValue([
        {
          destinationSessionID: mockClosedSessionID,
          amount: '10000',
          transferCount: '1',
        },
      ]);
      transferQueryBuilders[2].getRawMany.mockResolvedValue([
        {
          cashTransferID: 'transfer-1',
          status: CashTransferStatus.PENDING,
          amount: '5000',
          destinationType: CashTransferDestinationType.VAULT,
          sourceCashRegisterID: mockRegisterID,
          sourceSessionID: mockSessionID,
          destinationCashRegisterID: null,
          destinationLabel: 'Bóveda central',
          businessDate: '2026-09-01',
          requestedAt: new Date('2026-09-01T18:00:00.000Z'),
          requestedByUserID: mockOperatorA,
        },
      ]);
      sessionUserQueryBuilder.getRawMany.mockResolvedValue([
        { userID: mockOperatorA, sessionsAttended: '1' },
        { userID: mockOperatorB, sessionsAttended: '1' },
      ]);
      countQueryBuilder.getRawMany.mockResolvedValue([
        { countedByUserID: mockOperatorB, count: '1' },
      ]);
    };

    beforeEach(buildStoreSummaryData);

    it('debe consolidar los totales por día, caja y operador', async () => {
      const result = await service.getStoreSummary(
        mockStoreID,
        { from: '2026-09-01', to: '2026-09-30' },
        mockUser,
      );

      expect(result).toMatchObject({
        storeID: mockStoreID,
        from: '2026-09-01',
        to: '2026-09-30',
        sessionCount: 2,
        openSessionCount: 1,
        closedSessionCount: 1,
        openingBalanceTotal: 80000,
        expectedCashTotal: 110000,
        countedCashTotal: 44000,
        cashDifferenceTotal: -1000,
        cashMovements: {
          cashIn: 30000,
          cashOut: 5000,
          net: 25000,
          movementCount: 4,
        },
        payments: {
          paymentCount: 3,
          totalAmount: 45000,
          cashAmount: 30000,
          nonCashAmount: 15000,
        },
        transfers: {
          outCount: 1,
          outAmount: 25000,
          toRegisterAmount: 0,
          toVaultAmount: 25000,
          inCount: 1,
          inAmount: 10000,
          pendingCount: 1,
          pendingAmount: 5000,
        },
      });

      expect(result.byBusinessDate).toHaveLength(2);
      expect(result.byBusinessDate[0]).toMatchObject({
        businessDate: '2026-09-01',
        sessionCount: 1,
        cashIn: 20000,
        cashOut: 5000,
        netCash: 15000,
        paymentTotal: 35000,
        transfersOutAmount: 25000,
        expectedCash: 65000,
      });
      expect(result.byBusinessDate[1]).toMatchObject({
        businessDate: '2026-09-02',
        closedSessionCount: 1,
        cashIn: 10000,
        netCash: 10000,
        paymentTotal: 10000,
        transfersInAmount: 10000,
        expectedCash: 45000,
        countedCash: 44000,
        cashDifference: -1000,
      });

      expect(result.byCashRegister).toHaveLength(1);
      expect(result.byCashRegister[0]).toMatchObject({
        cashRegisterID: mockRegisterID,
        code: 'CAJA-01',
        sessionCount: 2,
        cashIn: 30000,
        cashOut: 5000,
        netCash: 25000,
        paymentTotal: 45000,
        expectedCash: 110000,
      });

      expect(result.pendingTransfers).toHaveLength(1);
      expect(result.pendingTransfers[0]).toMatchObject({
        cashTransferID: 'transfer-1',
        amount: 5000,
        destinationLabel: 'Bóveda central',
      });

      expect(result.byOperator).toHaveLength(2);
      expect(result.byOperator[0]).toMatchObject({
        userID: mockOperatorA,
        sessionsAttended: 1,
        movementsRegistered: 3,
        cashIn: 20000,
        cashOut: 5000,
        netCash: 15000,
        countsPerformed: 0,
      });
      expect(result.byOperator[1]).toMatchObject({
        userID: mockOperatorB,
        sessionsAttended: 1,
        movementsRegistered: 1,
        cashIn: 10000,
        cashOut: 0,
        netCash: 10000,
        countsPerformed: 1,
      });
    });

    it('debe devolver un resumen en cero cuando la tienda no tiene sesiones en el rango', async () => {
      sessionQueryBuilder.getRawMany.mockResolvedValue([]);

      const result = await service.getStoreSummary(
        mockStoreID,
        { from: '2026-09-01', to: '2026-09-30' },
        mockUser,
      );

      expect(result).toMatchObject({
        sessionCount: 0,
        expectedCashTotal: 0,
        countedCashTotal: 0,
        cashMovements: { cashIn: 0, cashOut: 0, net: 0, movementCount: 0 },
        byBusinessDate: [],
        byCashRegister: [],
        byOperator: [],
        pendingTransfers: [],
      });
      expect(movementQueryBuilder.getRawMany).not.toHaveBeenCalled();
    });

    it('debe usar por defecto una ventana de 30 días contables terminando hoy', async () => {
      await service.getStoreSummary(mockStoreID, {}, mockUser);

      const rangeCall = sessionQueryBuilder.andWhere.mock.calls.find(
        ([sql]) => typeof sql === 'string' && sql.includes('BETWEEN'),
      );
      expect(rangeCall).toBeDefined();

      const { from, to } = rangeCall![1] as { from: string; to: string };
      const spanInDays =
        (Date.parse(`${to}T00:00:00.000Z`) -
          Date.parse(`${from}T00:00:00.000Z`)) /
        86_400_000;

      expect(spanInDays).toBe(29);
    });

    it('debe rechazar un rango contable invertido', async () => {
      await expect(
        service.getStoreSummary(
          mockStoreID,
          { from: '2026-09-30', to: '2026-09-01' },
          mockUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe lanzar NotFoundException si la tienda no existe en el tenant', async () => {
      mockStoreRepo.findOne.mockResolvedValue(null);

      await expect(
        service.getStoreSummary(mockStoreID, {}, mockUser),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
