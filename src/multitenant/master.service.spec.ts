import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { MasterService } from './master.service';
import { Tenant, TenantStatus } from './entities/tenant.entity';
import { MasterUser } from './entities/master-user.entity';
import { AuditEvent } from './entities/audit-event.entity';
import { TenantContextService } from './tenant-context.service';
import { User, UserRole } from '../users/entities/user.entity';
import { Store, StoreType } from '../stores/entities/store.entity';

jest.mock('bcrypt');

describe('MasterService', () => {
  let service: MasterService;

  const mockTenantRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    count: jest.fn(),
    exists: jest.fn(),
  };
  const mockMasterUserRepository = {
    count: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
  };
  const mockAuditRepository = {
    save: jest.fn(),
    create: jest.fn(),
  };
  const mockJwtService = {
    signAsync: jest.fn(),
  };
  const mockConfigService = {
    get: jest.fn(),
  };

  const mockTenantTxRepository = {
    findOne: jest.fn(),
  };
  const mockUserTxRepository = {
    count: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const mockStoreTxRepository = {
    count: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    exists: jest.fn(),
  };
  const mockAuditTxRepository = {
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockManager = {
    getRepository: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const mockTenantContext = {
    run: jest.fn(),
    transaction: jest.fn(),
  };

  const activeTenant = {
    tenantID: 'tenant-1',
    status: TenantStatus.ACTIVE,
    maxUsers: 5,
    maxStores: 5,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashedPassword');

    mockTenantContext.run.mockImplementation(
      (_context: unknown, callback: () => unknown) => callback(),
    );
    mockTenantContext.transaction.mockImplementation(
      async (callback: (manager: unknown) => unknown) => callback(mockManager),
    );
    mockManager.getRepository.mockImplementation((entity: unknown) => {
      if (entity === Tenant) return mockTenantTxRepository;
      if (entity === User) return mockUserTxRepository;
      if (entity === Store) return mockStoreTxRepository;
      if (entity === AuditEvent) return mockAuditTxRepository;
      return null;
    });
    mockManager.create.mockImplementation(
      (_entity: unknown, input: unknown) => input,
    );
    mockManager.save.mockImplementation(async () => undefined);

    mockUserTxRepository.create.mockImplementation((input: unknown) => input);
    mockUserTxRepository.save.mockImplementation(
      async (input: unknown) => input,
    );
    mockStoreTxRepository.create.mockImplementation((input: unknown) => input);
    mockStoreTxRepository.save.mockImplementation(
      async (input: unknown) => input,
    );
    mockAuditTxRepository.create.mockImplementation((input: unknown) => input);
    mockAuditTxRepository.save.mockImplementation(async () => undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MasterService,
        {
          provide: getRepositoryToken(Tenant),
          useValue: mockTenantRepository,
        },
        {
          provide: getRepositoryToken(MasterUser),
          useValue: mockMasterUserRepository,
        },
        {
          provide: getRepositoryToken(AuditEvent),
          useValue: mockAuditRepository,
        },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        {
          provide: TenantContextService,
          useValue: mockTenantContext,
        },
      ],
    }).compile();

    service = module.get<MasterService>(MasterService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createTenantUser', () => {
    const createUserDto = {
      email: 'new@example.com',
      name: 'New User',
      role: UserRole.STORE_MANAGER,
      password: 'plainPassword',
    };

    it('creates a user with hashed password and audit event', async () => {
      mockTenantTxRepository.findOne.mockResolvedValue(activeTenant);
      mockUserTxRepository.count.mockResolvedValue(2);

      const result = await service.createTenantUser(
        'tenant-1',
        createUserDto,
        'master-1',
      );

      expect(bcrypt.hash).toHaveBeenCalledWith('plainPassword', 10);
      expect(mockUserTxRepository.create).toHaveBeenCalledWith({
        ...createUserDto,
        tenantID: 'tenant-1',
        password: 'hashedPassword',
        sessionVersion: 1,
      });
      expect(mockManager.create).toHaveBeenCalledWith(
        AuditEvent,
        expect.objectContaining({
          tenantID: 'tenant-1',
          masterUserID: 'master-1',
          action: 'CREATE_USER',
        }),
      );
      expect(result.password).toBe('hashedPassword');
    });

    it('rejects creation when tenant user limit is exceeded', async () => {
      mockTenantTxRepository.findOne.mockResolvedValue(activeTenant);
      mockUserTxRepository.count.mockResolvedValue(5);

      await expect(
        service.createTenantUser('tenant-1', createUserDto, 'master-1'),
      ).rejects.toThrow(ForbiddenException);
      expect(mockUserTxRepository.save).not.toHaveBeenCalled();
    });

    it('rejects creation for an inactive tenant', async () => {
      mockTenantTxRepository.findOne.mockResolvedValue({
        ...activeTenant,
        status: TenantStatus.SUSPENDED,
      });

      await expect(
        service.createTenantUser('tenant-1', createUserDto, 'master-1'),
      ).rejects.toThrow(ConflictException);
      expect(mockUserTxRepository.count).not.toHaveBeenCalled();
    });

    it('rejects creation when tenant does not exist', async () => {
      mockTenantTxRepository.findOne.mockResolvedValue(null);

      await expect(
        service.createTenantUser('tenant-1', createUserDto, 'master-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('createTenantStore', () => {
    const createStoreDto = {
      location: 'Providencia',
      rut: '76283592-1',
      address: 'Av. Siempre Viva 742',
      phone: '+56912345678',
      city: 'Santiago',
      email: 'contacto@tienda.com',
      name: 'Tienda Principal',
      type: StoreType.FRANCHISE,
      isCentralStore: false,
    };

    it('creates a store and audit event', async () => {
      mockTenantTxRepository.findOne.mockResolvedValue(activeTenant);
      mockStoreTxRepository.count.mockResolvedValue(1);

      const result = await service.createTenantStore(
        'tenant-1',
        createStoreDto,
        'master-1',
      );

      expect(mockStoreTxRepository.create).toHaveBeenCalledWith({
        ...createStoreDto,
        tenantID: 'tenant-1',
      });
      expect(mockManager.create).toHaveBeenCalledWith(
        AuditEvent,
        expect.objectContaining({
          tenantID: 'tenant-1',
          masterUserID: 'master-1',
          action: 'CREATE_STORE',
        }),
      );
      expect(result.name).toBe('Tienda Principal');
    });

    it('rejects creation when tenant store limit is exceeded', async () => {
      mockTenantTxRepository.findOne.mockResolvedValue(activeTenant);
      mockStoreTxRepository.count.mockResolvedValue(5);

      await expect(
        service.createTenantStore('tenant-1', createStoreDto, 'master-1'),
      ).rejects.toThrow(ForbiddenException);
      expect(mockStoreTxRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('updateTenantUser', () => {
    it('updates user fields scoped to the tenant', async () => {
      const existingUser = {
        userID: 'user-1',
        tenantID: 'tenant-1',
        email: 'user@example.com',
        name: 'Old Name',
        role: UserRole.STORE_MANAGER,
        password: 'oldHash',
      };
      mockUserTxRepository.findOne.mockResolvedValue(existingUser);

      const result = await service.updateTenantUser(
        'tenant-1',
        'user-1',
        { name: 'New Name', role: UserRole.ADMIN },
        'master-1',
      );

      expect(mockUserTxRepository.findOne).toHaveBeenCalledWith({
        where: { userID: 'user-1', tenantID: 'tenant-1' },
      });
      expect(result.name).toBe('New Name');
      expect(result.role).toBe(UserRole.ADMIN);
      expect(mockManager.create).toHaveBeenCalledWith(
        AuditEvent,
        expect.objectContaining({ action: 'UPDATE_USER' }),
      );
    });

    it('hashes the new password before saving', async () => {
      const existingUser = {
        userID: 'user-1',
        tenantID: 'tenant-1',
        email: 'user@example.com',
        name: 'Old Name',
        role: UserRole.STORE_MANAGER,
        password: 'oldHash',
      };
      mockUserTxRepository.findOne.mockResolvedValue(existingUser);

      await service.updateTenantUser(
        'tenant-1',
        'user-1',
        { password: 'newPassword' },
        'master-1',
      );

      expect(bcrypt.hash).toHaveBeenCalledWith('newPassword', 10);
      expect(mockUserTxRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ password: 'hashedPassword' }),
      );
    });

    it('throws NotFoundException when the user does not belong to the tenant', async () => {
      mockUserTxRepository.findOne.mockResolvedValue(null);

      await expect(
        service.updateTenantUser(
          'tenant-1',
          'user-1',
          { name: 'X' },
          'master-1',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateTenantStore', () => {
    it('updates store fields scoped to the tenant', async () => {
      const existingStore = {
        storeID: 'store-1',
        tenantID: 'tenant-1',
        name: 'Old Store',
        email: 'old@tienda.com',
      };
      mockStoreTxRepository.findOne.mockResolvedValue(existingStore);

      const result = await service.updateTenantStore(
        'tenant-1',
        'store-1',
        { name: 'New Store' },
        'master-1',
      );

      expect(mockStoreTxRepository.findOne).toHaveBeenCalledWith({
        where: { storeID: 'store-1', tenantID: 'tenant-1' },
      });
      expect(result.name).toBe('New Store');
      expect(mockManager.create).toHaveBeenCalledWith(
        AuditEvent,
        expect.objectContaining({ action: 'UPDATE_STORE' }),
      );
    });

    it('rejects a store email already used by another store in the tenant', async () => {
      const existingStore = {
        storeID: 'store-1',
        tenantID: 'tenant-1',
        name: 'Old Store',
        email: 'old@tienda.com',
      };
      mockStoreTxRepository.findOne.mockResolvedValue(existingStore);
      mockStoreTxRepository.exists.mockResolvedValue(true);

      await expect(
        service.updateTenantStore(
          'tenant-1',
          'store-1',
          { email: 'new@tienda.com' },
          'master-1',
        ),
      ).rejects.toThrow(ConflictException);
      expect(mockStoreTxRepository.save).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the store does not belong to the tenant', async () => {
      mockStoreTxRepository.findOne.mockResolvedValue(null);

      await expect(
        service.updateTenantStore(
          'tenant-1',
          'store-1',
          { name: 'X' },
          'master-1',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
