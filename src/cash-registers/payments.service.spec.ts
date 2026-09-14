import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TenantContextService } from '../multitenant/tenant-context.service';
import { SalePaymentType } from '../sales/entities/sale.entity';
import { CashMovementsService } from './cash-movements.service';
import { PaymentsService } from './payments.service';
import { CashRegister } from './entities/cash-register.entity';
import {
  CashRegisterSession,
  CashRegisterSessionStatus,
} from './entities/cash-register-session.entity';
import {
  CashMovementReason,
  CashMovementReferenceType,
  CashMovementType,
} from './entities/cash-movement.entity';
import { Payment, PaymentStatus } from './entities/payment.entity';
import {
  PaymentMethod,
  PaymentMethodType,
} from './entities/payment-method.entity';

describe('PaymentsService (Hito 2)', () => {
  let service: PaymentsService;

  const mockTenantID = 'tenant-uuid-1111';
  const mockStoreID = 'store-uuid-2222';
  const mockUserID = 'user-uuid-3333';
  const mockRegisterID = 'register-uuid-4444';
  const mockSessionID = 'session-uuid-5555';
  const mockSaleID = 'sale-uuid-7777';
  const mockCashMethodID = 'method-cash';
  const mockDebitMethodID = 'method-debit';

  const cashMethod = {
    paymentMethodID: mockCashMethodID,
    tenantID: mockTenantID,
    code: 'CASH',
    name: 'Efectivo',
    type: PaymentMethodType.CASH,
    affectsCash: true,
    active: true,
  };
  const debitMethod = {
    paymentMethodID: mockDebitMethodID,
    tenantID: mockTenantID,
    code: 'DEBIT_CARD',
    name: 'Débito',
    type: PaymentMethodType.DEBIT_CARD,
    affectsCash: false,
    active: true,
  };

  const mockPaymentRepo: {
    find: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    createQueryBuilder: jest.Mock;
    manager: { transaction: jest.Mock };
  } = {
    find: jest.fn(),
    create: jest.fn((values: object) => ({ ...values })),
    save: jest.fn((entity: object) => Promise.resolve(entity)),
    createQueryBuilder: jest.fn(),
    manager: {
      transaction: jest.fn((cb: (manager: unknown) => unknown) =>
        cb(mockEntityManager),
      ),
    },
  };

  const mockRegisterRepo: { findOne: jest.Mock } = { findOne: jest.fn() };
  const mockSessionRepo: { findOne: jest.Mock } = { findOne: jest.fn() };
  const mockMethodRepo: { find: jest.Mock } = { find: jest.fn() };

  const mockPaymentQueryBuilder: Record<string, jest.Mock> = {};
  for (const method of [
    'leftJoinAndSelect',
    'where',
    'andWhere',
    'orderBy',
    'addOrderBy',
  ]) {
    mockPaymentQueryBuilder[method] = jest
      .fn()
      .mockReturnValue(mockPaymentQueryBuilder);
  }
  mockPaymentQueryBuilder.getMany = jest.fn();

  const mockEntityManager: { getRepository: jest.Mock } = {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === CashRegister) return mockRegisterRepo;
      if (entity === CashRegisterSession) return mockSessionRepo;
      if (entity === PaymentMethod) return mockMethodRepo;
      if (entity === Payment)
        return {
          ...mockPaymentRepo,
          createQueryBuilder: jest.fn(() => mockPaymentQueryBuilder),
        };
      return null;
    }),
  };

  const mockCashMovementsService = {
    recordSystemMovement: jest.fn((_manager: unknown, input: object) =>
      Promise.resolve({ cashMovementID: 'movement-1', ...input }),
    ),
  };

  const mockTenantContext = {
    getTenantId: jest.fn().mockReturnValue(mockTenantID),
    transaction: jest.fn((cb: (manager: unknown) => unknown) =>
      cb(mockEntityManager),
    ),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRegisterRepo.findOne.mockResolvedValue({
      cashRegisterID: mockRegisterID,
      tenantID: mockTenantID,
      storeID: mockStoreID,
    });
    mockSessionRepo.findOne.mockResolvedValue({
      sessionID: mockSessionID,
      cashRegisterID: mockRegisterID,
      status: CashRegisterSessionStatus.OPEN,
    });
    mockMethodRepo.find.mockResolvedValue([cashMethod, debitMethod]);
    mockCashMovementsService.recordSystemMovement.mockImplementation(
      (_manager: unknown, input: object) =>
        Promise.resolve({ cashMovementID: 'movement-1', ...input }),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        {
          provide: getRepositoryToken(Payment),
          useValue: mockPaymentRepo,
        },
        {
          provide: CashMovementsService,
          useValue: mockCashMovementsService,
        },
        {
          provide: TenantContextService,
          useValue: mockTenantContext,
        },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
  });

  function resolve(
    overrides: Partial<
      Parameters<PaymentsService['resolveSalePayments']>[1]
    > = {},
  ) {
    return service.resolveSalePayments(mockEntityManager as never, {
      tenantID: mockTenantID,
      storeID: mockStoreID,
      saleTotal: 1190,
      paymentType: SalePaymentType.CASH,
      cashRegisterID: mockRegisterID,
      payments: [{ paymentMethodID: mockCashMethodID, amount: 1190 }],
      ...overrides,
    });
  }

  describe('resolveSalePayments', () => {
    it('debe devolver null cuando la venta no informa caja ni pagos', async () => {
      const result = await service.resolveSalePayments(
        mockEntityManager as never,
        {
          tenantID: mockTenantID,
          storeID: mockStoreID,
          saleTotal: 1190,
          paymentType: SalePaymentType.CASH,
        },
      );

      expect(result).toBeNull();
      expect(mockRegisterRepo.findOne).not.toHaveBeenCalled();
    });

    it('debe exigir cashRegisterID cuando se informan pagos', async () => {
      await expect(resolve({ cashRegisterID: undefined })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('debe exigir pagos cuando se informa la caja', async () => {
      await expect(resolve({ payments: [] })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('debe rechazar cajas de otra tienda', async () => {
      mockRegisterRepo.findOne.mockResolvedValue({
        cashRegisterID: mockRegisterID,
        tenantID: mockTenantID,
        storeID: 'otra-tienda',
      });

      await expect(resolve()).rejects.toThrow(BadRequestException);
    });

    it('debe exigir una sesión OPEN en la caja', async () => {
      mockSessionRepo.findOne.mockResolvedValue(null);

      await expect(resolve()).rejects.toThrow(BadRequestException);
    });

    it('debe rechazar medios de pago inactivos', async () => {
      mockMethodRepo.find.mockResolvedValue([{ ...cashMethod, active: false }]);

      await expect(resolve()).rejects.toThrow(BadRequestException);
    });

    it('debe rechazar medios de pago inexistentes', async () => {
      mockMethodRepo.find.mockResolvedValue([]);

      await expect(resolve()).rejects.toThrow(BadRequestException);
    });

    it('debe validar el invariante sum(Payment.amount) = Sale.total', async () => {
      await expect(
        resolve({
          payments: [{ paymentMethodID: mockCashMethodID, amount: 1000 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe rechazar pagos en efectivo sin un medio que mueva efectivo', async () => {
      await expect(
        resolve({
          paymentType: SalePaymentType.CASH,
          payments: [{ paymentMethodID: mockDebitMethodID, amount: 1190 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe resolver el contexto de cobro con sesión, medios y total', async () => {
      const result = await resolve();

      expect(result).toMatchObject({
        tenantID: mockTenantID,
        total: 1190,
      });
      expect(result?.session.sessionID).toBe(mockSessionID);
      expect(result?.lines).toHaveLength(1);
      expect(result?.lines[0].method.paymentMethodID).toBe(mockCashMethodID);
    });

    it('debe aceptar pagos mixtos que suman el total', async () => {
      const result = await resolve({
        payments: [
          { paymentMethodID: mockCashMethodID, amount: 700 },
          { paymentMethodID: mockDebitMethodID, amount: 490 },
        ],
      });

      expect(result?.lines).toHaveLength(2);
    });
  });

  describe('persistSalePayments', () => {
    it('debe persistir los pagos COMPLETED y generar CASH_IN solo para medios que afectan efectivo', async () => {
      const resolved = await resolve({
        payments: [
          {
            paymentMethodID: mockCashMethodID,
            amount: 700,
            authorizationCode: 'AUTH-1',
          },
          { paymentMethodID: mockDebitMethodID, amount: 490 },
        ],
      });

      const result = await service.persistSalePayments(
        mockEntityManager as never,
        resolved!,
        { saleID: mockSaleID, createdByUserID: mockUserID },
      );

      expect(result.payments).toHaveLength(2);
      expect(result.payments[0]).toMatchObject({
        tenantID: mockTenantID,
        saleID: mockSaleID,
        sessionID: mockSessionID,
        paymentMethodID: mockCashMethodID,
        amount: 700,
        status: PaymentStatus.COMPLETED,
        authorizationCode: 'AUTH-1',
      });
      expect(result.cashMovements).toHaveLength(1);
      expect(result.cashMovements[0]).toMatchObject({
        type: CashMovementType.CASH_IN,
        amount: 700,
        reason: CashMovementReason.SALE,
        referenceType: CashMovementReferenceType.SALE,
        referenceID: mockSaleID,
        createdByUserID: mockUserID,
      });
    });
  });

  describe('listSessionPayments', () => {
    it('debe listar los cobros de la sesión con su medio de pago', async () => {
      const payments = [{ paymentID: 'payment-1' }];
      mockPaymentQueryBuilder.getMany.mockResolvedValue(payments);

      const result = await service.listSessionPayments(
        mockRegisterID,
        mockSessionID,
        { status: PaymentStatus.COMPLETED },
      );

      expect(result).toEqual(payments);
      expect(mockPaymentQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
        'payment.paymentMethod',
        'paymentMethod',
      );
      expect(mockPaymentQueryBuilder.andWhere).toHaveBeenCalledWith(
        'payment.status = :status',
        { status: PaymentStatus.COMPLETED },
      );
    });
  });
});
