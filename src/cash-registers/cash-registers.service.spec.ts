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
import { Store } from '../stores/entities/store.entity';
import { UserstoresService } from '../relations/userstores/userstores.service';
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

  const mockCashRegisterRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    manager: {
      transaction: jest.fn((cb) => cb(mockEntityManager)),
    },
  };

  const mockSessionRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockStoreRepo = {
    findOne: jest.fn(),
  };

  const mockUserstoresService = {
    findStoresByUserId: jest.fn(),
  };

  const mockTenantContext = {
    getTenantId: jest.fn().mockReturnValue(mockTenantID),
    transaction: jest.fn((cb) => cb(mockEntityManager)),
  };

  const mockEntityManager = {
    getRepository: jest.fn((entity) => {
      if (entity === CashRegister) return mockCashRegisterRepo;
      if (entity === CashRegisterSession) return mockSessionRepo;
      if (entity === Store) return mockStoreRepo;
      return null;
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

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
          provide: UserstoresService,
          useValue: mockUserstoresService,
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
      mockUserstoresService.findStoresByUserId.mockResolvedValue([
        { store: { storeID: 'otra-tienda-uuid' } },
      ]);

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
      expect(mockUserstoresService.findStoresByUserId).not.toHaveBeenCalled();
    });

    it('debe lanzar ConflictException si ya existe una sesión abierta para la caja', async () => {
      mockCashRegisterRepo.findOne.mockResolvedValue({
        cashRegisterID: mockRegisterID,
        status: CashRegisterStatus.ACTIVE,
        storeID: mockStoreID,
      });
      mockUserstoresService.findStoresByUserId.mockResolvedValue([
        { store: { storeID: mockStoreID } },
      ]);
      mockSessionRepo.findOne.mockResolvedValue({
        sessionID: 'existing-open-session',
        status: CashRegisterSessionStatus.OPEN,
      });

      await expect(
        service.openSession(mockRegisterID, openDto, mockUser),
      ).rejects.toThrow(ConflictException);
    });

    it('debe abrir la sesión exitosamente con fondo inicial y fecha contable', async () => {
      mockCashRegisterRepo.findOne.mockResolvedValue({
        cashRegisterID: mockRegisterID,
        status: CashRegisterStatus.ACTIVE,
        storeID: mockStoreID,
      });
      mockUserstoresService.findStoresByUserId.mockResolvedValue([
        { store: { storeID: mockStoreID } },
      ]);
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
      mockUserstoresService.findStoresByUserId.mockResolvedValue([
        { store: { storeID: mockStoreID } },
      ]);
      mockSessionRepo.findOne.mockResolvedValue(null);

      await expect(
        service.closeSession(mockRegisterID, closeDto, mockUser),
      ).rejects.toThrow(NotFoundException);
    });

    it('debe cerrar la sesión, calcular la diferencia y sellar el estado en CLOSED', async () => {
      mockCashRegisterRepo.findOne.mockResolvedValue({
        cashRegisterID: mockRegisterID,
        storeID: mockStoreID,
      });
      mockUserstoresService.findStoresByUserId.mockResolvedValue([
        { store: { storeID: mockStoreID } },
      ]);

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
  });
});
