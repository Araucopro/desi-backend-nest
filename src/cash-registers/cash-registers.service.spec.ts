import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CashRegistersService } from './cash-registers.service';
import {
  CashRegister,
  CashRegisterStatus,
} from './entities/cash-register.entity';
import {
  CashRegisterSession,
  CashRegisterSessionStatus,
} from './entities/cash-register-session.entity';
import { CashMovement } from './entities/cash-movement.entity';
import { CashTransfer } from './entities/cash-transfer.entity';
import { CashRegisterSessionUser } from './entities/cash-register-session-user.entity';
import { Store } from '../stores/entities/store.entity';
import { UserStore } from '../relations/userstores/entities/userstore.entity';
import { TenantContextService } from '../multitenant/tenant-context.service';
import { UserRole } from '../users/entities/user.entity';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

describe('CashRegistersService (Hito 1)', () => {
  let service: CashRegistersService;

  const mockTenantID = 'tenant-uuid-1111';
  const mockStoreID = 'store-uuid-2222';
  const mockUserID = 'user-uuid-3333';
  const mockRegisterID = 'register-uuid-4444';
  const mockSessionID = 'session-uuid-5555';

  const mockUser: JwtPayload = {
    type: 'tenant',
    userId: mockUserID,
    id: mockUserID,
    tenantId: mockTenantID,
    sessionVersion: 1,
    email: 'cajero@arauco.cl',
    role: UserRole.STORE_MANAGER,
  };

  const mockAdminUser: JwtPayload = {
    ...mockUser,
    role: UserRole.ADMIN,
  };

  const mockCashRegisterRepo: {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    manager: { transaction: jest.Mock };
  } = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    manager: {
      transaction: jest.fn((cb: (manager: unknown) => unknown) =>
        cb(mockEntityManager),
      ),
    },
  };

  const mockSessionRepo: {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    createQueryBuilder: jest.Mock;
  } = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockCashMovementQueryBuilder: Record<string, jest.Mock> = {};
  for (const method of [
    'select',
    'addSelect',
    'where',
    'andWhere',
    'setParameters',
  ]) {
    mockCashMovementQueryBuilder[method] = jest
      .fn()
      .mockReturnValue(mockCashMovementQueryBuilder);
  }
  mockCashMovementQueryBuilder.getRawOne = jest.fn();

  const mockCashMovementRepo: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    createQueryBuilder: jest.Mock;
  } = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(() => mockCashMovementQueryBuilder),
  };

  const mockStoreRepo: { findOne: jest.Mock } = {
    findOne: jest.fn(),
  };

  const mockTransferRepo: { count: jest.Mock } = {
    count: jest.fn().mockResolvedValue(0),
  };

  const mockSessionUserQueryBuilder: Record<string, jest.Mock> = {};
  for (const method of ['update', 'set', 'where', 'andWhere']) {
    mockSessionUserQueryBuilder[method] = jest
      .fn()
      .mockReturnValue(mockSessionUserQueryBuilder);
  }
  mockSessionUserQueryBuilder.execute = jest
    .fn()
    .mockResolvedValue({ affected: 1 });

  const mockSessionUserRepo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    createQueryBuilder: jest.Mock;
  } = {
    findOne: jest.fn(),
    create: jest.fn((values: object) => ({ ...values })),
    save: jest.fn((entity: unknown) => Promise.resolve(entity)),
    createQueryBuilder: jest.fn(() => mockSessionUserQueryBuilder),
  };

  /**
   * `assertUserCanAccessStore` resuelve la asignación con el `EntityManager` de
   * la transacción, así que el mock vive en el manager y no en un servicio.
   */
  const mockUserStoreQueryBuilder: Record<string, jest.Mock> = {};
  for (const method of ['where', 'andWhere']) {
    mockUserStoreQueryBuilder[method] = jest
      .fn()
      .mockReturnValue(mockUserStoreQueryBuilder);
  }
  const mockUserStoreRepo: { createQueryBuilder: jest.Mock } = {
    createQueryBuilder: jest.fn(() => mockUserStoreQueryBuilder),
  };

  const mockTenantContext = {
    getTenantId: jest.fn().mockReturnValue(mockTenantID),
    transaction: jest.fn((cb: (manager: unknown) => unknown) =>
      cb(mockEntityManager),
    ),
  };

  const mockEntityManager: { getRepository: jest.Mock } = {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === CashRegister) return mockCashRegisterRepo;
      if (entity === CashRegisterSession) return mockSessionRepo;
      if (entity === CashMovement) return mockCashMovementRepo;
      if (entity === CashRegisterSessionUser) return mockSessionUserRepo;
      if (entity === CashTransfer) return mockTransferRepo;
      if (entity === Store) return mockStoreRepo;
      if (entity === UserStore) return mockUserStoreRepo;
      return null;
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockCashMovementQueryBuilder.getRawOne.mockResolvedValue({
      net: '0',
      cashIn: '0',
      cashOut: '0',
    });
    mockTransferRepo.count.mockResolvedValue(0);
    mockUserStoreQueryBuilder.getOne = jest.fn().mockResolvedValue({
      userStoreID: 'user-store-uuid-8888',
      storeID: mockStoreID,
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CashRegistersService,
        {
          provide: getRepositoryToken(CashRegister),
          useValue: mockCashRegisterRepo,
        },
        {
          provide: getRepositoryToken(CashRegisterSession),
          useValue: mockSessionRepo,
        },
        {
          provide: getRepositoryToken(Store),
          useValue: mockStoreRepo,
        },
        {
          provide: TenantContextService,
          useValue: mockTenantContext,
        },
      ],
    }).compile();

    service = module.get<CashRegistersService>(CashRegistersService);
  });

  describe('create', () => {
    it('debe lanzar NotFoundException si la tienda no existe en el tenant', async () => {
      mockStoreRepo.findOne.mockResolvedValue(null);

      await expect(
        service.create({
          storeID: mockStoreID,
          code: 'CAJA-01',
          name: 'Caja Principal',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('debe lanzar ConflictException si ya existe una caja con el mismo código en la tienda', async () => {
      mockStoreRepo.findOne.mockResolvedValue({ storeID: mockStoreID });
      mockCashRegisterRepo.findOne.mockResolvedValue({
        cashRegisterID: 'existing-id',
        code: 'CAJA-01',
      });

      await expect(
        service.create({
          storeID: mockStoreID,
          code: 'CAJA-01',
          name: 'Caja Principal',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('debe crear exitosamente la caja en estado ACTIVE por defecto', async () => {
      mockStoreRepo.findOne.mockResolvedValue({ storeID: mockStoreID });
      mockCashRegisterRepo.findOne.mockResolvedValue(null);
      const created = {
        cashRegisterID: mockRegisterID,
        tenantID: mockTenantID,
        storeID: mockStoreID,
        code: 'CAJA-01',
        name: 'Caja Principal',
        status: CashRegisterStatus.ACTIVE,
      };
      mockCashRegisterRepo.create.mockReturnValue(created);
      mockCashRegisterRepo.save.mockResolvedValue(created);

      const result = await service.create({
        storeID: mockStoreID,
        code: 'caja-01',
        name: 'Caja Principal',
      });

      expect(result).toEqual(created);
      expect(mockCashRegisterRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'CAJA-01',
          status: CashRegisterStatus.ACTIVE,
        }),
      );
    });
  });

  describe('openSession', () => {
    const openDto = {
      businessDate: '2026-09-13',
      openingBalance: 50000,
      openingNotes: 'Apertura de turno',
    };

    it('debe lanzar BadRequestException si la caja está inactiva', async () => {
      mockCashRegisterRepo.findOne.mockResolvedValue({
        cashRegisterID: mockRegisterID,
        status: CashRegisterStatus.INACTIVE,
        storeID: mockStoreID,
      });

      await expect(
        service.openSession(mockRegisterID, openDto, mockUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe lanzar ForbiddenException si el usuario no pertenece a la tienda de la caja', async () => {
      mockCashRegisterRepo.findOne.mockResolvedValue({
        cashRegisterID: mockRegisterID,
        status: CashRegisterStatus.ACTIVE,
        storeID: mockStoreID,
      });
      // El usuario está asignado a otra tienda diferente
      mockUserStoreQueryBuilder.getOne.mockResolvedValue(null);

      await expect(
        service.openSession(mockRegisterID, openDto, mockUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('debe permitir apertura a un ADMIN incluso sin UserStore directo', async () => {
      mockCashRegisterRepo.findOne.mockResolvedValue({
        cashRegisterID: mockRegisterID,
        status: CashRegisterStatus.ACTIVE,
        storeID: mockStoreID,
      });
      mockSessionRepo.findOne.mockResolvedValue(null);

      const newSession = {
        sessionID: mockSessionID,
        cashRegisterID: mockRegisterID,
        status: CashRegisterSessionStatus.OPEN,
        openingBalance: 50000,
      };
      mockSessionRepo.create.mockReturnValue(newSession);
      mockSessionRepo.save.mockResolvedValue(newSession);

      const result = await service.openSession(
        mockRegisterID,
        openDto,
        mockAdminUser,
      );

      expect(result).toEqual(newSession);
      expect(mockUserStoreRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('debe bloquear la fila de la caja al abrir para serializar aperturas concurrentes', async () => {
      mockCashRegisterRepo.findOne.mockResolvedValue({
        cashRegisterID: mockRegisterID,
        status: CashRegisterStatus.ACTIVE,
        storeID: mockStoreID,
      });
      mockSessionRepo.findOne.mockResolvedValue(null);

      const createdSession = {
        sessionID: mockSessionID,
        cashRegisterID: mockRegisterID,
        businessDate: '2026-09-13',
        openingBalance: 50000,
        status: CashRegisterSessionStatus.OPEN,
      };
      mockSessionRepo.create.mockReturnValue(createdSession);
      mockSessionRepo.save.mockResolvedValue(createdSession);

      await service.openSession(mockRegisterID, openDto, mockUser);

      expect(mockCashRegisterRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          lock: { mode: 'pessimistic_write' },
        }),
      );
    });

    it('debe lanzar ConflictException si otro usuario ya tiene la caja abierta', async () => {
      mockCashRegisterRepo.findOne.mockResolvedValue({
        cashRegisterID: mockRegisterID,
        status: CashRegisterStatus.ACTIVE,
        storeID: mockStoreID,
      });
      mockSessionRepo.findOne.mockResolvedValue({
        sessionID: 'existing-open-session',
        status: CashRegisterSessionStatus.OPEN,
        openedByUserID: 'otro-cajero-uuid',
        businessDate: '2026-09-13',
      });

      await expect(
        service.openSession(mockRegisterID, openDto, mockUser),
      ).rejects.toThrow(ConflictException);
    });

    it('debe lanzar ConflictException si el mismo cajero abre una fecha contable distinta', async () => {
      mockCashRegisterRepo.findOne.mockResolvedValue({
        cashRegisterID: mockRegisterID,
        status: CashRegisterStatus.ACTIVE,
        storeID: mockStoreID,
      });
      mockSessionRepo.findOne.mockResolvedValue({
        sessionID: 'existing-open-session',
        status: CashRegisterSessionStatus.OPEN,
        openedByUserID: mockUserID,
        businessDate: '2026-09-12',
      });

      await expect(
        service.openSession(mockRegisterID, openDto, mockUser),
      ).rejects.toThrow(ConflictException);
    });

    it('debe ser idempotente: reintento del mismo cajero y fecha devuelve la sesión existente', async () => {
      mockCashRegisterRepo.findOne.mockResolvedValue({
        cashRegisterID: mockRegisterID,
        status: CashRegisterStatus.ACTIVE,
        storeID: mockStoreID,
      });
      const existingSession = {
        sessionID: 'existing-open-session',
        status: CashRegisterSessionStatus.OPEN,
        openedByUserID: mockUserID,
        businessDate: '2026-09-13',
      };
      mockSessionRepo.findOne.mockResolvedValue(existingSession);

      const result = await service.openSession(
        mockRegisterID,
        openDto,
        mockUser,
      );

      expect(result).toBe(existingSession);
      expect(mockSessionRepo.save).not.toHaveBeenCalled();
    });

    it('debe traducir una violación de unicidad del INSERT a ConflictException', async () => {
      mockCashRegisterRepo.findOne.mockResolvedValue({
        cashRegisterID: mockRegisterID,
        status: CashRegisterStatus.ACTIVE,
        storeID: mockStoreID,
      });
      mockSessionRepo.findOne.mockResolvedValue(null);

      const createdSession = {
        sessionID: mockSessionID,
        cashRegisterID: mockRegisterID,
        businessDate: '2026-09-13',
        openingBalance: 50000,
        status: CashRegisterSessionStatus.OPEN,
      };
      mockSessionRepo.create.mockReturnValue(createdSession);
      mockSessionRepo.save.mockRejectedValue(
        Object.assign(new Error('duplicate key value'), {
          code: '23505',
          driverError: {
            code: '23505',
            constraint: 'IDX_unique_open_session_per_register',
          },
        }),
      );

      await expect(
        service.openSession(mockRegisterID, openDto, mockUser),
      ).rejects.toThrow(ConflictException);
    });

    it('debe reportar el conflicto real cuando el índice violado es el de operador activo', async () => {
      mockCashRegisterRepo.findOne.mockResolvedValue({
        cashRegisterID: mockRegisterID,
        status: CashRegisterStatus.ACTIVE,
        storeID: mockStoreID,
      });
      mockSessionRepo.findOne.mockResolvedValue(null);

      const createdSession = {
        sessionID: mockSessionID,
        cashRegisterID: mockRegisterID,
        businessDate: '2026-09-13',
        openingBalance: 50000,
        status: CashRegisterSessionStatus.OPEN,
      };
      mockSessionRepo.create.mockReturnValue(createdSession);
      mockSessionRepo.save.mockRejectedValue(
        Object.assign(new Error('duplicate key value'), {
          code: '23505',
          driverError: {
            code: '23505',
            constraint: 'IDX_unique_active_session_user',
          },
        }),
      );

      await expect(
        service.openSession(mockRegisterID, openDto, mockUser),
      ).rejects.toThrow(/operador ya está registrado/);
    });

    it('debe abrir la sesión exitosamente con fondo inicial y fecha contable', async () => {
      mockCashRegisterRepo.findOne.mockResolvedValue({
        cashRegisterID: mockRegisterID,
        status: CashRegisterStatus.ACTIVE,
        storeID: mockStoreID,
      });
      mockSessionRepo.findOne.mockResolvedValue(null);

      const createdSession = {
        sessionID: mockSessionID,
        cashRegisterID: mockRegisterID,
        businessDate: '2026-09-13',
        openingBalance: 50000,
        status: CashRegisterSessionStatus.OPEN,
      };
      mockSessionRepo.create.mockReturnValue(createdSession);
      mockSessionRepo.save.mockResolvedValue(createdSession);

      const result = await service.openSession(
        mockRegisterID,
        openDto,
        mockUser,
      );

      expect(result).toEqual(createdSession);
      expect(mockSessionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantID: mockTenantID,
          cashRegisterID: mockRegisterID,
          businessDate: '2026-09-13',
          openingBalance: 50000,
          status: CashRegisterSessionStatus.OPEN,
        }),
      );
    });
  });

  describe('closeSession', () => {
    const closeDto = {
      countedCashBalance: 48000,
      closingNotes: 'Diferencia de -$2.000 por redondeo',
    };

    it('debe lanzar NotFoundException si no hay una sesión activa para cerrar', async () => {
      mockCashRegisterRepo.findOne.mockResolvedValue({
        cashRegisterID: mockRegisterID,
        storeID: mockStoreID,
      });
      mockUserStoreQueryBuilder.getOne.mockResolvedValue({
        userStoreID: 'user-store-uuid-8888',
        storeID: mockStoreID,
      });
      mockSessionRepo.findOne.mockResolvedValue(null);

      await expect(
        service.closeSession(mockRegisterID, closeDto, mockUser),
      ).rejects.toThrow(NotFoundException);
    });

    it('debe cerrar la sesión con saldo esperado igual al fondo inicial cuando no hay movimientos', async () => {
      mockCashRegisterRepo.findOne.mockResolvedValue({
        cashRegisterID: mockRegisterID,
        storeID: mockStoreID,
      });
      mockUserStoreQueryBuilder.getOne.mockResolvedValue({
        userStoreID: 'user-store-uuid-8888',
        storeID: mockStoreID,
      });

      const activeSession = {
        sessionID: mockSessionID,
        cashRegisterID: mockRegisterID,
        openingBalance: 50000,
        status: CashRegisterSessionStatus.OPEN,
      };
      mockSessionRepo.findOne.mockResolvedValue(activeSession);
      mockSessionRepo.save.mockImplementation((session) =>
        Promise.resolve(session),
      );

      const result = await service.closeSession(
        mockRegisterID,
        closeDto,
        mockUser,
      );

      expect(result.status).toBe(CashRegisterSessionStatus.CLOSED);
      expect(result.expectedCashBalance).toBe(50000);
      expect(result.countedCashBalance).toBe(48000);
      expect(result.cashDifference).toBe(-2000); // 48000 - 50000
      expect(result.closedByUserID).toBe(mockUserID);
      expect(result.closingNotes).toBe(closeDto.closingNotes);
      expect(result.closedAt).toBeInstanceOf(Date);
    });

    it('debe bloquear el cierre directo si la sesión tiene transferencias de fondos en curso (Hito 5)', async () => {
      mockCashRegisterRepo.findOne.mockResolvedValue({
        cashRegisterID: mockRegisterID,
        storeID: mockStoreID,
      });
      mockUserStoreQueryBuilder.getOne.mockResolvedValue({
        userStoreID: 'user-store-uuid-8888',
        storeID: mockStoreID,
      });
      mockSessionRepo.findOne.mockResolvedValue({
        sessionID: mockSessionID,
        cashRegisterID: mockRegisterID,
        openingBalance: 50000,
        status: CashRegisterSessionStatus.OPEN,
      });
      mockTransferRepo.count.mockResolvedValue(2);

      await expect(
        service.closeSession(mockRegisterID, closeDto, mockUser),
      ).rejects.toThrow(BadRequestException);

      expect(mockSessionRepo.save).not.toHaveBeenCalled();
    });

    it('debe calcular el saldo esperado sumando cobros y retiros de la sesión (Hito 2)', async () => {
      mockCashRegisterRepo.findOne.mockResolvedValue({
        cashRegisterID: mockRegisterID,
        storeID: mockStoreID,
      });
      mockUserStoreQueryBuilder.getOne.mockResolvedValue({
        userStoreID: 'user-store-uuid-8888',
        storeID: mockStoreID,
      });
      mockSessionRepo.findOne.mockResolvedValue({
        sessionID: mockSessionID,
        cashRegisterID: mockRegisterID,
        openingBalance: 50000,
        status: CashRegisterSessionStatus.OPEN,
      });
      mockSessionRepo.save.mockImplementation((session) =>
        Promise.resolve(session),
      );
      // 50000 de fondo + 15000 de cobros en efectivo = 65000 esperado
      mockCashMovementQueryBuilder.getRawOne.mockResolvedValue({
        net: '15000',
        cashIn: '15000',
        cashOut: '0',
      });

      const result = await service.closeSession(
        mockRegisterID,
        { countedCashBalance: 48000 },
        mockUser,
      );

      expect(result.expectedCashBalance).toBe(65000);
      expect(result.cashDifference).toBe(-17000);
      expect(mockCashMovementQueryBuilder.andWhere).toHaveBeenCalledWith(
        'movement.status = :posted',
        expect.anything(),
      );
    });
  });
});
