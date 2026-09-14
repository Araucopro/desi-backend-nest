import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { TenantContextService } from '../multitenant/tenant-context.service';
import { UserstoresService } from '../relations/userstores/userstores.service';
import { UserRole } from '../users/entities/user.entity';
import { CashClosingsService } from './cash-closings.service';
import { CashRegister } from './entities/cash-register.entity';
import {
  CashRegisterSession,
  CashRegisterSessionStatus,
} from './entities/cash-register-session.entity';
import {
  CashRegisterClosing,
  CashRegisterClosingStatus,
} from './entities/cash-register-closing.entity';
import { CashMovement } from './entities/cash-movement.entity';
import { Payment, PaymentStatus } from './entities/payment.entity';

describe('CashClosingsService (Hito 3)', () => {
  let service: CashClosingsService;

  const mockTenantID = 'tenant-uuid-1111';
  const mockStoreID = 'store-uuid-2222';
  const mockUserID = 'user-uuid-3333';
  const mockRegisterID = 'register-uuid-4444';
  const mockSessionID = 'session-uuid-5555';
  const mockClosingID = 'closing-uuid-6666';

  const mockAdminUser: JwtPayload = {
    type: 'tenant',
    userId: mockUserID,
    id: mockUserID,
    tenantId: mockTenantID,
    sessionVersion: 1,
    email: 'supervisor@arauco.cl',
    role: UserRole.ADMIN,
  };

  const mockConsignadoUser: JwtPayload = {
    ...mockAdminUser,
    role: UserRole.CONSIGNADO,
  };

  const mockMovementQueryBuilder: Record<string, jest.Mock> = {};
  for (const method of [
    'select',
    'addSelect',
    'where',
    'andWhere',
    'setParameters',
  ]) {
    mockMovementQueryBuilder[method] = jest
      .fn()
      .mockReturnValue(mockMovementQueryBuilder);
  }
  mockMovementQueryBuilder.getRawOne = jest.fn();

  const mockPaymentQueryBuilder: Record<string, jest.Mock> = {};
  for (const method of [
    'innerJoin',
    'select',
    'addSelect',
    'where',
    'andWhere',
    'groupBy',
    'addGroupBy',
    'orderBy',
  ]) {
    mockPaymentQueryBuilder[method] = jest
      .fn()
      .mockReturnValue(mockPaymentQueryBuilder);
  }
  mockPaymentQueryBuilder.getRawMany = jest.fn();

  const mockClosingRepo: {
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
    findOne: jest.Mock;
    manager: { transaction: jest.Mock };
  } = {
    create: jest.fn((values: object) => ({ ...values })),
    save: jest.fn((entity: unknown) => Promise.resolve(entity)),
    find: jest.fn(),
    findOne: jest.fn(),
    manager: {
      transaction: jest.fn((cb: (manager: unknown) => unknown) =>
        cb(mockEntityManager),
      ),
    },
  };

  const mockSessionRepo: { findOne: jest.Mock; save: jest.Mock } = {
    findOne: jest.fn(),
    save: jest.fn((entity: unknown) => Promise.resolve(entity)),
  };

  const mockRegisterRepo: { findOne: jest.Mock } = {
    findOne: jest.fn(),
  };

  const mockMovementRepo: {
    createQueryBuilder: jest.Mock;
    findOne: jest.Mock;
  } = {
    createQueryBuilder: jest.fn(() => mockMovementQueryBuilder),
    findOne: jest.fn(),
  };

  const mockPaymentRepo: { createQueryBuilder: jest.Mock } = {
    createQueryBuilder: jest.fn(() => mockPaymentQueryBuilder),
  };

  const mockEntityManager: { getRepository: jest.Mock } = {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === CashRegister) return mockRegisterRepo;
      if (entity === CashRegisterSession) return mockSessionRepo;
      if (entity === CashRegisterClosing) return mockClosingRepo;
      if (entity === CashMovement) return mockMovementRepo;
      if (entity === Payment) return mockPaymentRepo;
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
    transaction: jest.fn((cb: (manager: unknown) => unknown) =>
      cb(mockEntityManager),
    ),
  };

  const buildSession = (overrides: Record<string, unknown> = {}) => ({
    sessionID: mockSessionID,
    tenantID: mockTenantID,
    cashRegisterID: mockRegisterID,
    openingBalance: 50000,
    status: CashRegisterSessionStatus.OPEN,
    ...overrides,
  });

  const buildPendingClosing = (overrides: Record<string, unknown> = {}) => ({
    closingID: mockClosingID,
    tenantID: mockTenantID,
    sessionID: mockSessionID,
    status: CashRegisterClosingStatus.PENDING,
    expectedCashAmount: 65000,
    expectedNonCashAmount: 0,
    expectedTotalAmount: 65000,
    countedCashAmount: null,
    cashDifference: null,
    actualTotalAmount: null,
    performedByUserID: mockUserID,
    startedAt: new Date('2026-09-14T18:00:00.000Z'),
    notes: null,
    ...overrides,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRegisterRepo.findOne.mockResolvedValue({
      cashRegisterID: mockRegisterID,
      tenantID: mockTenantID,
      storeID: mockStoreID,
      status: 'ACTIVE',
    });
    mockSessionRepo.findOne.mockResolvedValue(buildSession());
    mockUserstoresService.findStoresByUserId.mockResolvedValue([
      { store: { storeID: mockStoreID } },
    ]);
    mockClosingRepo.findOne.mockResolvedValue(null);
    mockClosingRepo.save.mockImplementation((entity: unknown) =>
      Promise.resolve(entity),
    );
    mockSessionRepo.save.mockImplementation((entity: unknown) =>
      Promise.resolve(entity),
    );
    // Fondo 50000 + movimientos netos 15000 = 65000 esperado en efectivo.
    mockMovementQueryBuilder.getRawOne.mockResolvedValue({
      net: '15000',
      cashIn: '20000',
      cashOut: '5000',
      movementCount: '4',
    });
    mockPaymentQueryBuilder.getRawMany.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CashClosingsService,
        {
          provide: getRepositoryToken(CashRegisterClosing),
          useValue: mockClosingRepo,
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

    service = module.get<CashClosingsService>(CashClosingsService);
  });

  describe('startClosing', () => {
    it('debe iniciar el arqueo en PENDING con el saldo esperado y la fotografía de la sesión', async () => {
      const result = await service.startClosing(
        mockRegisterID,
        mockSessionID,
        { notes: 'Arqueo turno tarde' },
        mockAdminUser,
      );

      expect(result).toMatchObject({
        tenantID: mockTenantID,
        sessionID: mockSessionID,
        status: CashRegisterClosingStatus.PENDING,
        expectedCashAmount: 65000,
        expectedNonCashAmount: 0,
        expectedTotalAmount: 65000,
        cashMovementCount: 4,
        paymentCount: 0,
        paymentMethodTotals: [],
        performedByUserID: mockUserID,
        notes: 'Arqueo turno tarde',
      });
      expect(result.startedAt).toBeInstanceOf(Date);
      expect(mockSessionRepo.save).not.toHaveBeenCalled();
    });

    it('debe fotografiar los cobros en tarjetas u otros medios sin afectar el efectivo esperado', async () => {
      mockPaymentQueryBuilder.getRawMany.mockResolvedValue([
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

      const result = await service.startClosing(
        mockRegisterID,
        mockSessionID,
        {},
        mockAdminUser,
      );

      expect(result.expectedCashAmount).toBe(65000);
      expect(result.expectedNonCashAmount).toBe(30000);
      expect(result.expectedTotalAmount).toBe(95000);
      expect(result.paymentCount).toBe(3);
      expect(result.paymentMethodTotals).toEqual([
        expect.objectContaining({ code: 'CASH', affectsCash: true }),
        expect.objectContaining({ code: 'DEBIT_CARD', affectsCash: false }),
      ]);
      expect(mockPaymentQueryBuilder.andWhere).toHaveBeenCalledWith(
        'payment.status = :status',
        { status: PaymentStatus.COMPLETED },
      );
    });

    it('debe lanzar ConflictException si la sesión ya tiene un arqueo en curso', async () => {
      mockClosingRepo.findOne.mockResolvedValue(buildPendingClosing());

      await expect(
        service.startClosing(mockRegisterID, mockSessionID, {}, mockAdminUser),
      ).rejects.toThrow(ConflictException);
    });

    it('debe lanzar BadRequestException si la caja no tiene sesión abierta', async () => {
      mockSessionRepo.findOne.mockResolvedValue(null);

      await expect(
        service.startClosing(mockRegisterID, mockSessionID, {}, mockAdminUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe lanzar NotFoundException si la sesión no pertenece a la caja de la ruta', async () => {
      await expect(
        service.startClosing(
          mockRegisterID,
          'otra-sesion-uuid',
          {},
          mockAdminUser,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('debe lanzar ForbiddenException si el usuario no pertenece a la tienda', async () => {
      mockUserstoresService.findStoresByUserId.mockResolvedValue([
        { store: { storeID: 'otra-tienda' } },
      ]);

      await expect(
        service.startClosing(
          mockRegisterID,
          mockSessionID,
          {},
          mockConsignadoUser,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('registerCount', () => {
    it('debe computar la diferencia entre el efectivo contado y el esperado', async () => {
      mockClosingRepo.findOne.mockResolvedValue(buildPendingClosing());

      const result = await service.registerCount(
        mockRegisterID,
        mockSessionID,
        { countedCashAmount: 48000, notes: 'Faltante en sencillo' },
        mockAdminUser,
      );

      expect(result).toMatchObject({
        status: CashRegisterClosingStatus.PENDING,
        expectedCashAmount: 65000,
        countedCashAmount: 48000,
        cashDifference: -17000,
        actualTotalAmount: 48000,
        notes: 'Faltante en sencillo',
      });
      expect(mockSessionRepo.save).not.toHaveBeenCalled();
    });

    it('debe lanzar NotFoundException si no hay arqueo en curso', async () => {
      mockClosingRepo.findOne.mockResolvedValue(null);

      await expect(
        service.registerCount(
          mockRegisterID,
          mockSessionID,
          { countedCashAmount: 48000 },
          mockAdminUser,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('completeClosing', () => {
    it('debe sellar el arqueo y cerrar la sesión con los montos finales', async () => {
      mockClosingRepo.findOne.mockResolvedValue(
        buildPendingClosing({ countedCashAmount: 48000 }),
      );

      const result = await service.completeClosing(
        mockRegisterID,
        mockSessionID,
        { notes: 'Cierre turno tarde' },
        mockAdminUser,
      );

      expect(result).toMatchObject({
        status: CashRegisterClosingStatus.COMPLETED,
        expectedCashAmount: 65000,
        countedCashAmount: 48000,
        cashDifference: -17000,
        actualTotalAmount: 48000,
        completedByUserID: mockUserID,
        notes: 'Cierre turno tarde',
      });
      expect(result.completedAt).toBeInstanceOf(Date);

      expect(mockSessionRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionID: mockSessionID,
          status: CashRegisterSessionStatus.CLOSED,
          expectedCashBalance: 65000,
          countedCashBalance: 48000,
          cashDifference: -17000,
          closedByUserID: mockUserID,
        }),
      );
    });

    it('debe aceptar el efectivo contado en el propio cierre', async () => {
      mockClosingRepo.findOne.mockResolvedValue(buildPendingClosing());

      const result = await service.completeClosing(
        mockRegisterID,
        mockSessionID,
        { countedCashAmount: 65000 },
        mockAdminUser,
      );

      expect(result).toMatchObject({
        status: CashRegisterClosingStatus.COMPLETED,
        countedCashAmount: 65000,
        cashDifference: 0,
        actualTotalAmount: 65000,
      });
    });

    it('debe lanzar BadRequestException si no se registró el efectivo contado', async () => {
      mockClosingRepo.findOne.mockResolvedValue(buildPendingClosing());

      await expect(
        service.completeClosing(
          mockRegisterID,
          mockSessionID,
          {},
          mockAdminUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('rejectClosing', () => {
    it('debe exigir facultad de aprobación para rechazar el arqueo', async () => {
      await expect(
        service.rejectClosing(
          mockRegisterID,
          mockSessionID,
          { reason: 'Conteo incompleto' },
          mockConsignadoUser,
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(mockClosingRepo.save).not.toHaveBeenCalled();
    });

    it('debe rechazar el arqueo en curso dejando la sesión abierta', async () => {
      mockClosingRepo.findOne.mockResolvedValue(buildPendingClosing());

      const result = await service.rejectClosing(
        mockRegisterID,
        mockSessionID,
        { reason: 'Conteo incompleto' },
        mockAdminUser,
      );

      expect(result).toMatchObject({
        status: CashRegisterClosingStatus.REJECTED,
        rejectedByUserID: mockUserID,
        rejectionReason: 'Conteo incompleto',
      });
      expect(result.rejectedAt).toBeInstanceOf(Date);
      expect(mockSessionRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('findClosings', () => {
    it('debe listar los arqueos de la sesión', async () => {
      const closings = [{ closingID: mockClosingID }];
      mockClosingRepo.find.mockResolvedValue(closings);

      const result = await service.findClosings(mockRegisterID, mockSessionID);

      expect(result).toEqual(closings);
      expect(mockClosingRepo.find).toHaveBeenCalledWith({
        where: { tenantID: mockTenantID, sessionID: mockSessionID },
        order: { startedAt: 'DESC' },
      });
    });

    it('debe lanzar NotFoundException si la sesión no existe', async () => {
      mockSessionRepo.findOne.mockResolvedValue(null);

      await expect(
        service.findClosings(mockRegisterID, 'otra-sesion-uuid'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
