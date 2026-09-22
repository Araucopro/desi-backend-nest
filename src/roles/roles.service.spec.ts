import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RolesService } from './roles.service';
import { Role } from './entities/role.entity';
import { Permission } from './entities/permission.entity';
import { TenantContextService } from '../multitenant/tenant-context.service';
import { AbilityFactory } from '../auth/ability/ability.factory';

describe('RolesService', () => {
  let service: RolesService;

  const mockTenantID = '11111111-1111-1111-1111-111111111111';

  const mockRoleRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  };

  const mockPermissionRepo = {
    find: jest.fn(),
    findBy: jest.fn(),
  };

  const mockTenantContext = {
    getTenantId: jest.fn().mockReturnValue(mockTenantID),
    transaction: jest.fn().mockImplementation((cb: (manager: any) => any) => {
      const manager = {
        getRepository: jest.fn().mockImplementation((entity: any) => {
          if (entity === Role) return mockRoleRepo;
          if (entity === Permission) return mockPermissionRepo;
          return {
            find: jest.fn(),
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            delete: jest.fn(),
            count: jest.fn(),
          };
        }),
      };
      return cb(manager);
    }),
  };

  const mockAbilityFactory = {
    invalidate: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockTenantContext.getTenantId.mockReturnValue(mockTenantID);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesService,
        {
          provide: getRepositoryToken(Permission),
          useValue: mockPermissionRepo,
        },
        {
          provide: TenantContextService,
          useValue: mockTenantContext,
        },
        {
          provide: AbilityFactory,
          useValue: mockAbilityFactory,
        },
      ],
    }).compile();

    service = module.get<RolesService>(RolesService);
  });

  describe('findAll', () => {
    it('should filter roles by tenantID from context', async () => {
      const mockRoles = [
        {
          id: 'role-1',
          name: 'Vendedor',
          tenantID: mockTenantID,
          permissions: [],
        },
      ];
      mockRoleRepo.find.mockResolvedValue(mockRoles);

      const result = await service.findAll();

      expect(mockTenantContext.getTenantId).toHaveBeenCalled();
      expect(mockRoleRepo.find).toHaveBeenCalledWith({
        where: { tenantID: mockTenantID },
        relations: ['permissions', 'permissions.permission'],
        order: { name: 'ASC' },
      });
      expect(result).toEqual(mockRoles);
    });
  });
});
