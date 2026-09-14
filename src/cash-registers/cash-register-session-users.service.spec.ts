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
import { UserStore } from '../relations/userstores/entities/userstore.entity';
import { UserstoresService } from '../relations/userstores/userstores.service';
import { UserRole, UserStatus } from '../users/entities/user.entity';
import { CashRegisterSessionUsersService } from './cash-register-session-users.service';
import {
  CashRegisterSessionUser,
  CashRegisterSessionUserRole,
} from './entities/cash-register-session-user.entity';
import { CashRegister } from './entities/cash-register.entity';
import {
  CashRegisterSession,
  CashRegisterSessionStatus,
} from './entities/cash-register-session.entity';

describe('CashRegisterSessionUsersService (Hito 4)', () => {
  let service: CashRegisterSessionUsersService;

  const mockTenantID = 'tenant-uuid-1111';
  const mockStoreID = 'store-uuid-2222';
  const mockUserID = 'user-uuid-3333';
  const mockOperatorID = 'user-uuid-9999';
  const mockRegisterID = 'register-uuid-4444';
  const mockSessionID = 'session-uuid-5555';
  const mockSessionUserID = 'session-user-uuid-6666';
  const mockOpenedAt = new Date('2026-09-14T12:00:00.000Z');

  const mockUser: JwtPayload = {
    type: 'tenant',
    userId: mockUserID,
    id: mockUserID,
    tenantId: mockTenantID,
    sessionVersion: 1,
    email: 'supervisor@arauco.cl',
    role: UserRole.STORE_MANAGER,
  };

  const mockQueryBuilder: Record<string, jest.Mock> = {};
  for (const method of ['leftJoinAndSelect', 'where', 'andWhere', 'orderBy']) {
    mockQueryBuilder[method] = jest.fn().mockReturnValue(mockQueryBuilder);
  }
  mockQueryBuilder.getMany = jest.fn();

  const mockSessionUserRepo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    createQueryBuilder: jest.Mock;
    manager: { transaction: jest.Mock };
  } = {
    findOne: jest.fn(),
    create: jest.fn((values: object) => ({ ...values })),
    save: jest.fn((entity: unknown) => Promise.resolve(entity)),
    createQueryBuilder: jest.fn(() => mockQueryBuilder),
    manager: { transaction: jest.fn() },
  };

  const mockRegisterRepo = { findOne: jest.fn() };
  const mockSessionRepo = { findOne: jest.fn() };
  const mockUserStoreRepo = { findOne: jest.fn() };

  const mockEntityManager: { getRepository: jest.Mock } = {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === CashRegister) return mockRegisterRepo;
      if (entity === CashRegisterSession) return mockSessionRepo;
      if (entity === CashRegisterSessionUser) return mockSessionUserRepo;
      if (entity === UserStore) return mockUserStoreRepo;
      return null;
    }),
  };
  mockSessionUserRepo.manager.transaction = jest.fn(
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
      openedAt: mockOpenedAt,
    });
    mockSessionUserRepo.findOne.mockResolvedValue(null);
    mockSessionUserRepo.save.mockImplementation((entity: unknown) =>
      Promise.resolve(entity),
    );
    mockUserStoreRepo.findOne.mockResolvedValue({
      userStoreID: 'user-store-uuid-1',
      user: { userID: mockOperatorID, status: UserStatus.ACTIVE },
    });
    mockUserstoresService.findStoresByUserId.mockResolvedValue([
      { store: { storeID: mockStoreID } },
    ]);
    mockQueryBuilder.getMany.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CashRegisterSessionUsersService,
        {
          provide: getRepositoryToken(CashRegisterSessionUser),
          useValue: mockSessionUserRepo,
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

    service = module.get<CashRegisterSessionUsersService>(
      CashRegisterSessionUsersService,
    );
  });

  describe('assign', () => {
    it('debe registrar la entrada del cajero en la sesión abierta', async () => {
      const result = await service.assign(
        mockRegisterID,
        mockSessionID,
        { userID: mockOperatorID },
        mockUser,
      );

      expect(result).toMatchObject({
        tenantID: mockTenantID,
        sessionID: mockSessionID,
        userID: mockOperatorID,
        role: CashRegisterSessionUserRole.OPERATOR,
        assignedByUserID: mockUserID,
        leftAt: null,
      });
      expect(result.enteredAt.getTime()).toBeGreaterThanOrEqual(
        mockOpenedAt.getTime(),
      );
    });

    it('debe aceptar una hora de entrada explícita posterior a la apertura', async () => {
      const enteredAt = new Date('2026-09-14T14:30:00.000Z');

      const result = await service.assign(
        mockRegisterID,
        mockSessionID,
        {
          userID: mockOperatorID,
          role: CashRegisterSessionUserRole.SUPERVISOR,
          enteredAt: enteredAt.toISOString(),
        },
        mockUser,
      );

      expect(result.role).toBe(CashRegisterSessionUserRole.SUPERVISOR);
      expect(result.enteredAt.toISOString()).toBe(enteredAt.toISOString());
    });

    it('debe lanzar BadRequestException si el usuario no está asignado a la tienda', async () => {
      mockUserStoreRepo.findOne.mockResolvedValue(null);

      await expect(
        service.assign(
          mockRegisterID,
          mockSessionID,
          { userID: mockOperatorID },
          mockUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe lanzar BadRequestException si el usuario está inactivo', async () => {
      mockUserStoreRepo.findOne.mockResolvedValue({
        userStoreID: 'user-store-uuid-1',
        user: { userID: mockOperatorID, status: UserStatus.INACTIVE },
      });

      await expect(
        service.assign(
          mockRegisterID,
          mockSessionID,
          { userID: mockOperatorID },
          mockUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe lanzar ConflictException si el usuario ya está en turno', async () => {
      mockSessionUserRepo.findOne.mockResolvedValue({
        sessionUserID: mockSessionUserID,
        userID: mockOperatorID,
      });

      await expect(
        service.assign(
          mockRegisterID,
          mockSessionID,
          { userID: mockOperatorID },
          mockUser,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('debe lanzar BadRequestException si la entrada es anterior a la apertura', async () => {
      await expect(
        service.assign(
          mockRegisterID,
          mockSessionID,
          {
            userID: mockOperatorID,
            enteredAt: '2026-09-14T11:00:00.000Z',
          },
          mockUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe lanzar ForbiddenException si el usuario no pertenece a la tienda de la caja', async () => {
      mockUserstoresService.findStoresByUserId.mockResolvedValue([]);

      await expect(
        service.assign(
          mockRegisterID,
          mockSessionID,
          { userID: mockOperatorID },
          mockUser,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('registerExit', () => {
    const buildRecord = (overrides: Record<string, unknown> = {}) => ({
      sessionUserID: mockSessionUserID,
      tenantID: mockTenantID,
      sessionID: mockSessionID,
      userID: mockOperatorID,
      role: CashRegisterSessionUserRole.OPERATOR,
      enteredAt: new Date('2026-09-14T13:00:00.000Z'),
      leftAt: null,
      notes: null,
      ...overrides,
    });

    it('debe registrar la salida del operador y conservar sus notas', async () => {
      mockSessionUserRepo.findOne.mockResolvedValue(
        buildRecord({ notes: 'Entrada 13:00' }),
      );

      const result = await service.registerExit(
        mockRegisterID,
        mockSessionID,
        mockSessionUserID,
        { notes: 'Entrega de caja a turno noche' },
        mockUser,
      );

      expect(result.leftAt).toBeInstanceOf(Date);
      expect((result.leftAt as Date).getTime()).toBeGreaterThanOrEqual(
        new Date('2026-09-14T13:00:00.000Z').getTime(),
      );
      expect(result.notes).toBe(
        'Entrada 13:00 | Entrega de caja a turno noche',
      );
    });

    it('debe lanzar ConflictException si el operador ya registró su salida', async () => {
      mockSessionUserRepo.findOne.mockResolvedValue(
        buildRecord({ leftAt: new Date('2026-09-14T20:00:00.000Z') }),
      );

      await expect(
        service.registerExit(
          mockRegisterID,
          mockSessionID,
          mockSessionUserID,
          {},
          mockUser,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('debe lanzar BadRequestException si la salida es anterior a la entrada', async () => {
      mockSessionUserRepo.findOne.mockResolvedValue(buildRecord());

      await expect(
        service.registerExit(
          mockRegisterID,
          mockSessionID,
          mockSessionUserID,
          { leftAt: '2026-09-14T12:30:00.000Z' },
          mockUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe lanzar NotFoundException si el registro de operador no existe', async () => {
      mockSessionUserRepo.findOne.mockResolvedValue(null);

      await expect(
        service.registerExit(
          mockRegisterID,
          mockSessionID,
          mockSessionUserID,
          {},
          mockUser,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findSessionUsers', () => {
    it('debe filtrar los operadores aún en turno cuando active es true', async () => {
      mockQueryBuilder.getMany.mockResolvedValue([
        {
          sessionUserID: mockSessionUserID,
          userID: mockOperatorID,
          user: { userID: mockOperatorID, name: 'Cajero' },
        },
      ]);

      const result = await service.findSessionUsers(
        mockRegisterID,
        mockSessionID,
        { active: true },
      );

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'sessionUser.leftAt IS NULL',
      );
      expect(result).toHaveLength(1);
    });
  });
});
