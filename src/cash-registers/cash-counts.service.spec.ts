import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { TenantContextService } from '../multitenant/tenant-context.service';
import { UserstoresService } from '../relations/userstores/userstores.service';
import { UserRole } from '../users/entities/user.entity';
import { CashClosingsService } from './cash-closings.service';
import { CashCountsService } from './cash-counts.service';
import { CashDenominationsService } from './cash-denominations.service';
import { CashCount, CashCountStatus } from './entities/cash-count.entity';
import { CashCountItem } from './entities/cash-count-item.entity';
import {
  CashDenomination,
  CashDenominationType,
} from './entities/cash-denomination.entity';
import { CashRegister } from './entities/cash-register.entity';
import {
  CashRegisterClosing,
  CashRegisterClosingStatus,
} from './entities/cash-register-closing.entity';
import {
  CashRegisterSession,
  CashRegisterSessionStatus,
} from './entities/cash-register-session.entity';

describe('CashCountsService (Hito 4)', () => {
  let service: CashCountsService;

  const mockTenantID = 'tenant-uuid-1111';
  const mockStoreID = 'store-uuid-2222';
  const mockUserID = 'user-uuid-3333';
  const mockRegisterID = 'register-uuid-4444';
  const mockSessionID = 'session-uuid-5555';
  const mockClosingID = 'closing-uuid-6666';
  const mockCountID = 'count-uuid-7777';
  const mockBanknote20000ID = 'denomination-uuid-20000';
  const mockCoin5000ID = 'denomination-uuid-5000';

  const mockUser: JwtPayload = {
    type: 'tenant',
    userId: mockUserID,
    id: mockUserID,
    tenantId: mockTenantID,
    sessionVersion: 1,
    email: 'cajero@arauco.cl',
    role: UserRole.STORE_MANAGER,
  };

  const buildCount = (overrides: Record<string, unknown> = {}) => ({
    cashCountID: mockCountID,
    tenantID: mockTenantID,
    closingID: mockClosingID,
    sessionID: mockSessionID,
    status: CashCountStatus.DRAFT,
    totalAmount: 0,
    itemCount: 0,
    countedByUserID: mockUserID,
    startedAt: new Date('2026-09-14T20:00:00.000Z'),
    notes: null,
    items: [],
    ...overrides,
  });

  const buildDenomination = (overrides: Record<string, unknown> = {}) => ({
    cashDenominationID: mockBanknote20000ID,
    tenantID: mockTenantID,
    value: 20000,
    type: CashDenominationType.BANKNOTE,
    label: '$20.000',
    sortOrder: 90,
    active: true,
    ...overrides,
  });

  const mockRegisterRepo = { findOne: jest.fn() };
  const mockSessionRepo = { findOne: jest.fn() };
  const mockClosingRepo = {
    findOne: jest.fn(),
    save: jest.fn((entity: unknown) => Promise.resolve(entity)),
  };
  const mockCountRepo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    manager: { transaction: jest.Mock };
  } = {
    findOne: jest.fn(),
    // El repositorio real asigna el UUID al persistir; el mock lo replica para
    // que el servicio pueda releer el conteo recién creado por su ID.
    create: jest.fn((values: object) => ({
      cashCountID: mockCountID,
      ...values,
    })),
    save: jest.fn((entity: { cashCountID?: string }) =>
      Promise.resolve({ cashCountID: mockCountID, ...entity }),
    ),
    manager: { transaction: jest.fn() },
  };
  const mockItemRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((values: object) => ({ ...values })),
    save: jest.fn((entity: unknown) => Promise.resolve(entity)),
    remove: jest.fn(),
  };
  const mockDenominationRepo = { find: jest.fn() };

  const mockEntityManager: { getRepository: jest.Mock } = {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === CashRegister) return mockRegisterRepo;
      if (entity === CashRegisterSession) return mockSessionRepo;
      if (entity === CashRegisterClosing) return mockClosingRepo;
      if (entity === CashCount) return mockCountRepo;
      if (entity === CashCountItem) return mockItemRepo;
      if (entity === CashDenomination) return mockDenominationRepo;
      return null;
    }),
  };
  mockCountRepo.manager.transaction = jest.fn(
    (callback: (manager: unknown) => unknown) => callback(mockEntityManager),
  );

  const mockUserstoresService = {
    findStoresByUserId: jest
      .fn()
      .mockResolvedValue([{ store: { storeID: mockStoreID } }]),
  };

  const mockTenantContext = {
    getTenantId: jest.fn().mockReturnValue(mockTenantID),
    transaction: jest.fn((callback: (manager: unknown) => unknown) =>
      callback(mockEntityManager),
    ),
  };

  const mockCashClosingsService = {
    applyCountedCashAmount: jest.fn(
      (_manager: unknown, _session: unknown, closing: unknown) =>
        Promise.resolve(closing),
    ),
  };

  /**
   * Enruta las búsquedas de `CashCount` según la consulta del servicio:
   * por ID (conteo puntual), por estado (borrador/completado) o por sesión.
   */
  const mockCountLookups = (counts: {
    byID?: unknown;
    draft?: unknown;
    completed?: unknown;
    bySession?: unknown;
  }) => {
    mockCountRepo.findOne.mockImplementation(
      (options: { where: Record<string, unknown> }) => {
        const where = options.where;
        if (where.cashCountID) return Promise.resolve(counts.byID ?? null);
        if (where.status === CashCountStatus.DRAFT) {
          return Promise.resolve(counts.draft ?? null);
        }
        if (where.status === CashCountStatus.COMPLETED) {
          return Promise.resolve(counts.completed ?? null);
        }
        if (where.sessionID) return Promise.resolve(counts.bySession ?? null);
        return Promise.resolve(null);
      },
    );
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockRegisterRepo.findOne.mockResolvedValue({
      cashRegisterID: mockRegisterID,
      tenantID: mockTenantID,
      storeID: mockStoreID,
      status: 'ACTIVE',
    });
    mockSessionRepo.findOne.mockResolvedValue({
      sessionID: mockSessionID,
      tenantID: mockTenantID,
      cashRegisterID: mockRegisterID,
      status: CashRegisterSessionStatus.OPEN,
      openedAt: new Date('2026-09-14T12:00:00.000Z'),
    });
    mockClosingRepo.findOne.mockResolvedValue({
      closingID: mockClosingID,
      tenantID: mockTenantID,
      sessionID: mockSessionID,
      status: CashRegisterClosingStatus.PENDING,
      expectedCashAmount: 65000,
      expectedNonCashAmount: 0,
      expectedTotalAmount: 65000,
    });
    mockClosingRepo.save.mockImplementation((entity: unknown) =>
      Promise.resolve(entity),
    );
    mockCountRepo.save.mockImplementation((entity: unknown) =>
      Promise.resolve(entity),
    );
    mockItemRepo.find.mockResolvedValue([]);
    mockItemRepo.findOne.mockResolvedValue(null);
    mockItemRepo.remove.mockResolvedValue(undefined);
    mockDenominationRepo.find.mockResolvedValue([buildDenomination()]);
    mockUserstoresService.findStoresByUserId.mockResolvedValue([
      { store: { storeID: mockStoreID } },
    ]);
    mockCashClosingsService.applyCountedCashAmount.mockImplementation(
      (_manager: unknown, _session: unknown, closing: unknown) =>
        Promise.resolve(closing),
    );
    mockCountLookups({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CashCountsService,
        CashDenominationsService,
        {
          provide: getRepositoryToken(CashCount),
          useValue: mockCountRepo,
        },
        {
          provide: getRepositoryToken(CashCountItem),
          useValue: mockItemRepo,
        },
        {
          provide: getRepositoryToken(CashDenomination),
          useValue: mockDenominationRepo,
        },
        {
          provide: CashClosingsService,
          useValue: mockCashClosingsService,
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

    service = module.get<CashCountsService>(CashCountsService);
  });

  describe('start', () => {
    it('debe iniciar un conteo DRAFT sobre el arqueo PENDING de la sesión', async () => {
      mockCountLookups({
        byID: buildCount({ notes: 'Arqueo turno tarde' }),
      });

      const result = await service.start(
        mockRegisterID,
        mockSessionID,
        { notes: 'Arqueo turno tarde' },
        mockUser,
      );

      expect(result).toMatchObject({
        tenantID: mockTenantID,
        closingID: mockClosingID,
        sessionID: mockSessionID,
        status: CashCountStatus.DRAFT,
        totalAmount: 0,
        itemCount: 0,
        countedByUserID: mockUserID,
        notes: 'Arqueo turno tarde',
      });
      expect(mockCountRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          closingID: mockClosingID,
          status: CashCountStatus.DRAFT,
        }),
      );
    });

    it('debe lanzar ConflictException si el arqueo ya tiene un conteo completado', async () => {
      mockCountLookups({
        completed: buildCount({ status: CashCountStatus.COMPLETED }),
      });

      await expect(
        service.start(mockRegisterID, mockSessionID, {}, mockUser),
      ).rejects.toThrow(ConflictException);
    });

    it('debe lanzar ConflictException si el arqueo ya tiene un conteo en curso', async () => {
      mockCountLookups({ draft: buildCount() });

      await expect(
        service.start(mockRegisterID, mockSessionID, {}, mockUser),
      ).rejects.toThrow(ConflictException);
    });

    it('debe lanzar NotFoundException si la sesión no tiene arqueo en curso', async () => {
      mockClosingRepo.findOne.mockResolvedValue(null);

      await expect(
        service.start(mockRegisterID, mockSessionID, {}, mockUser),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('upsertItems', () => {
    it('debe recalcular el total del conteo a partir de los subtotales de las denominaciones', async () => {
      const draftCount = buildCount();
      mockCountLookups({ draft: draftCount, byID: draftCount });
      mockDenominationRepo.find.mockResolvedValue([
        buildDenomination(),
        buildDenomination({
          cashDenominationID: mockCoin5000ID,
          value: 5000,
          label: '$5.000',
          sortOrder: 70,
        }),
      ]);
      mockItemRepo.find.mockResolvedValue([
        { subtotal: 100000 },
        { subtotal: 5000 },
      ]);

      const result = await service.upsertItems(
        mockRegisterID,
        mockSessionID,
        {
          items: [
            { denominationID: mockBanknote20000ID, quantity: 5 },
            { denominationID: mockCoin5000ID, quantity: 1 },
          ],
        },
        mockUser,
      );

      expect(mockItemRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          denominationID: mockBanknote20000ID,
          denominationValue: 20000,
          denominationType: CashDenominationType.BANKNOTE,
          quantity: 5,
          subtotal: 100000,
        }),
      );
      expect(result).toMatchObject({
        cashCountID: mockCountID,
        totalAmount: 105000,
        itemCount: 2,
      });
      expect(
        mockCashClosingsService.applyCountedCashAmount,
      ).not.toHaveBeenCalled();
    });

    it('debe eliminar el ítem cuando la cantidad contada es 0', async () => {
      const draftCount = buildCount();
      const existingItem = {
        cashCountItemID: 'item-uuid-1',
        denominationID: mockBanknote20000ID,
        quantity: 5,
        subtotal: 100000,
      };
      mockCountLookups({ draft: draftCount, byID: draftCount });
      mockItemRepo.findOne.mockResolvedValue(existingItem);
      mockItemRepo.find.mockResolvedValue([]);

      const result = await service.upsertItems(
        mockRegisterID,
        mockSessionID,
        {
          items: [{ denominationID: mockBanknote20000ID, quantity: 0 }],
        },
        mockUser,
      );

      expect(mockItemRepo.remove).toHaveBeenCalledWith(existingItem);
      expect(result).toMatchObject({ totalAmount: 0, itemCount: 0 });
    });

    it('debe lanzar BadRequestException si la lista trae denominaciones duplicadas', async () => {
      mockCountLookups({ draft: buildCount() });

      await expect(
        service.upsertItems(
          mockRegisterID,
          mockSessionID,
          {
            items: [
              { denominationID: mockBanknote20000ID, quantity: 1 },
              { denominationID: mockBanknote20000ID, quantity: 2 },
            ],
          },
          mockUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe lanzar BadRequestException si la denominación está inactiva', async () => {
      mockCountLookups({ draft: buildCount() });
      mockDenominationRepo.find.mockResolvedValue([
        buildDenomination({ active: false }),
      ]);

      await expect(
        service.upsertItems(
          mockRegisterID,
          mockSessionID,
          {
            items: [{ denominationID: mockBanknote20000ID, quantity: 1 }],
          },
          mockUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe lanzar NotFoundException si el conteo en curso no existe', async () => {
      mockCountLookups({});

      await expect(
        service.upsertItems(
          mockRegisterID,
          mockSessionID,
          {
            items: [{ denominationID: mockBanknote20000ID, quantity: 1 }],
          },
          mockUser,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('complete', () => {
    it('debe sellar el conteo y proyectar el total de denominaciones al arqueo', async () => {
      const draftCount = buildCount();
      mockCountLookups({ draft: draftCount, byID: draftCount });
      mockItemRepo.find.mockResolvedValue([
        { subtotal: 100000 },
        { subtotal: 50000 },
      ]);

      const result = await service.complete(
        mockRegisterID,
        mockSessionID,
        { notes: 'Conteo verificado' },
        mockUser,
      );

      expect(result).toMatchObject({
        cashCountID: mockCountID,
        status: CashCountStatus.COMPLETED,
        totalAmount: 150000,
        itemCount: 2,
        completedByUserID: mockUserID,
        notes: 'Conteo verificado',
      });
      expect(result.countedAt).toBeInstanceOf(Date);
      expect(
        mockCashClosingsService.applyCountedCashAmount,
      ).toHaveBeenCalledWith(
        mockEntityManager,
        expect.objectContaining({ sessionID: mockSessionID }),
        expect.objectContaining({ closingID: mockClosingID }),
        150000,
      );
    });

    it('debe lanzar BadRequestException si el conteo no tiene denominaciones', async () => {
      mockCountLookups({ draft: buildCount() });
      mockItemRepo.find.mockResolvedValue([]);

      await expect(
        service.complete(mockRegisterID, mockSessionID, {}, mockUser),
      ).rejects.toThrow(BadRequestException);
      expect(
        mockCashClosingsService.applyCountedCashAmount,
      ).not.toHaveBeenCalled();
    });
  });

  describe('cancel', () => {
    it('debe descartar el conteo en curso con su motivo', async () => {
      const draftCount = buildCount();
      mockCountLookups({ draft: draftCount, byID: draftCount });

      const result = await service.cancel(
        mockRegisterID,
        mockSessionID,
        { reason: 'Se interrumpió el conteo' },
        mockUser,
      );

      expect(result).toMatchObject({
        cashCountID: mockCountID,
        status: CashCountStatus.CANCELLED,
        cancelledByUserID: mockUserID,
        cancellationReason: 'Se interrumpió el conteo',
      });
      expect(result.cancelledAt).toBeInstanceOf(Date);
    });
  });

  describe('findCurrent', () => {
    it('debe devolver el último conteo de la sesión con su desglose ordenado', async () => {
      const storedCount = buildCount();
      mockCountLookups({
        bySession: storedCount,
        byID: buildCount({
          items: [
            { denominationValue: 500, subtotal: 500 },
            { denominationValue: 20000, subtotal: 100000 },
          ],
        }),
      });

      const result = await service.findCurrent(mockRegisterID, mockSessionID);

      expect(result.items.map((item) => item.denominationValue)).toEqual([
        20000, 500,
      ]);
    });

    it('debe lanzar NotFoundException si la sesión no tiene conteos detallados', async () => {
      mockCountLookups({});

      await expect(
        service.findCurrent(mockRegisterID, mockSessionID),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
