import { Test, TestingModule } from '@nestjs/testing';
import { UserstoresService } from './userstores.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UserStore } from './entities/userstore.entity';
import { Repository } from 'typeorm';
import { UsersService } from '../../users/users.service';
import { StoresService } from '../../stores/stores.service';
import { ConflictException, NotFoundException } from '@nestjs/common';

describe('UserstoresService', () => {
  let service: UserstoresService;
  let userStoreRepository: Repository<UserStore>;

  const mockUserStoreRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
    createQueryBuilder: jest.fn(),
    manager: undefined as any,
  };

  const mockQueryBuilder = {
    where: jest.fn(),
    andWhere: jest.fn(),
    orderBy: jest.fn(),
    setLock: jest.fn(),
    getOne: jest.fn(),
  };

  const mockUsersService = {
    findOneById: jest.fn(),
  };

  const mockStoresService = {
    findOne: jest.fn(),
  };

  const mockUser = { userID: 'user-uuid-1', name: 'Test User' };
  const mockStore = { storeID: 'store-uuid-1', name: 'Test Store' };
  const mockUserStore: Partial<UserStore> = {
    userStoreID: 'userstore-uuid-1',
    user: mockUser as any,
    store: mockStore as any,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockQueryBuilder.where.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.andWhere.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.orderBy.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.setLock.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.getOne.mockResolvedValue(null);
    mockUserStoreRepository.createQueryBuilder.mockReturnValue(
      mockQueryBuilder,
    );
    mockUserStoreRepository.manager = {
      transaction: jest.fn(async (callback) =>
        callback({
          getRepository: jest.fn().mockReturnValue(mockUserStoreRepository),
        }),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserstoresService,
        {
          provide: getRepositoryToken(UserStore),
          useValue: mockUserStoreRepository,
        },
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
        {
          provide: StoresService,
          useValue: mockStoresService,
        },
      ],
    }).compile();

    service = module.get<UserstoresService>(UserstoresService);
    userStoreRepository = module.get<Repository<UserStore>>(
      getRepositoryToken(UserStore),
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a user-store relation', async () => {
      mockUsersService.findOneById.mockResolvedValue(mockUser);
      mockStoresService.findOne.mockResolvedValue(mockStore);
      mockUserStoreRepository.findOne.mockResolvedValue(null);
      mockUserStoreRepository.create.mockReturnValue(mockUserStore);
      mockUserStoreRepository.save.mockResolvedValue(mockUserStore);

      const result = await service.create({
        userID: 'user-uuid-1',
        storeID: 'store-uuid-1',
      });

      expect(result).toEqual(mockUserStore);
      expect(mockUsersService.findOneById).toHaveBeenCalledWith('user-uuid-1');
      expect(mockStoresService.findOne).toHaveBeenCalledWith('store-uuid-1');
      expect(mockQueryBuilder.setLock).toHaveBeenCalledWith(
        'pessimistic_write',
      );
    });

    it('should throw ConflictException if relation already exists', async () => {
      mockUsersService.findOneById.mockResolvedValue(mockUser);
      mockStoresService.findOne.mockResolvedValue(mockStore);
      mockUserStoreRepository.findOne.mockResolvedValue(mockUserStore);

      await expect(
        service.create({ userID: 'user-uuid-1', storeID: 'store-uuid-1' }),
      ).rejects.toThrow(ConflictException);
      expect(mockUserStoreRepository.create).not.toHaveBeenCalled();
      expect(mockQueryBuilder.getOne).not.toHaveBeenCalled();
    });

    it('should reopen a relation closed today instead of creating a new one', async () => {
      const closedRelation: Partial<UserStore> = {
        ...mockUserStore,
        effectiveFrom: '2026-01-01',
        effectiveTo: '2026-09-15',
        removedAt: new Date('2026-09-15T12:00:00Z'),
      };
      mockUsersService.findOneById.mockResolvedValue(mockUser);
      mockStoresService.findOne.mockResolvedValue(mockStore);
      mockUserStoreRepository.findOne.mockResolvedValue(null);
      mockQueryBuilder.getOne.mockResolvedValue(closedRelation);
      mockUserStoreRepository.save.mockImplementation(
        async (entity: UserStore) => entity,
      );

      const result = await service.create({
        userID: 'user-uuid-1',
        storeID: 'store-uuid-1',
      });

      expect(mockUserStoreRepository.create).not.toHaveBeenCalled();
      expect(mockUserStoreRepository.save).toHaveBeenCalledWith(closedRelation);
      expect(result.effectiveTo).toBeNull();
      expect(result.removedAt).toBeNull();
      expect(result.user).toBe(mockUser);
      expect(result.store).toBe(mockStore);
    });

    it('should create a new relation when the previous one was closed on an earlier day', async () => {
      mockUsersService.findOneById.mockResolvedValue(mockUser);
      mockStoresService.findOne.mockResolvedValue(mockStore);
      mockUserStoreRepository.findOne.mockResolvedValue(null);
      // La consulta filtra por effectiveTo >= hoy, así que una fila cerrada
      // en un día anterior no se considera reabrible.
      mockQueryBuilder.getOne.mockResolvedValue(null);
      mockUserStoreRepository.create.mockReturnValue(mockUserStore);
      mockUserStoreRepository.save.mockResolvedValue(mockUserStore);

      const result = await service.create({
        userID: 'user-uuid-1',
        storeID: 'store-uuid-1',
      });

      expect(result).toEqual(mockUserStore);
      expect(mockUserStoreRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          user: mockUser,
          store: mockStore,
          effectiveFrom: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        }),
      );
    });

    it('should throw NotFoundException if user not found', async () => {
      mockUsersService.findOneById.mockRejectedValue(new NotFoundException());

      await expect(
        service.create({ userID: 'not-found', storeID: 'store-uuid-1' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('should return all user-store relations', async () => {
      mockUserStoreRepository.find.mockResolvedValue([mockUserStore]);

      const result = await service.findAll();

      expect(result).toEqual([mockUserStore]);
      expect(mockUserStoreRepository.find).toHaveBeenCalledWith({
        where: {
          effectiveTo: expect.any(Object),
          removedAt: expect.any(Object),
        },
        relations: ['user', 'store'],
      });
    });
  });

  describe('findStoresByUserId', () => {
    it('should return stores for a user', async () => {
      mockUserStoreRepository.find.mockResolvedValue([mockUserStore]);

      const result = await service.findStoresByUserId('user-uuid-1');

      expect(result).toEqual([mockUserStore]);
      expect(mockUserStoreRepository.find).toHaveBeenCalledWith({
        where: {
          user: { userID: 'user-uuid-1' },
          effectiveTo: expect.any(Object),
          removedAt: expect.any(Object),
        },
        relations: ['store'],
      });
    });
  });

  describe('findUsersByStoreId', () => {
    it('should return users for a store', async () => {
      mockUserStoreRepository.find.mockResolvedValue([mockUserStore]);

      const result = await service.findUsersByStoreId('store-uuid-1');

      expect(result).toEqual([mockUserStore]);
      expect(mockUserStoreRepository.find).toHaveBeenCalledWith({
        where: {
          store: { storeID: 'store-uuid-1' },
          effectiveTo: expect.any(Object),
          removedAt: expect.any(Object),
        },
        relations: ['user'],
      });
    });
  });

  describe('remove', () => {
    it('should close a user-store relation without deleting it', async () => {
      mockUserStoreRepository.findOne.mockResolvedValue(mockUserStore);
      mockUserStoreRepository.save.mockResolvedValue(mockUserStore);

      await service.remove('userstore-uuid-1');

      expect(mockUserStoreRepository.remove).not.toHaveBeenCalled();
      expect(mockUserStoreRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          effectiveTo: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
          removedAt: expect.any(Date),
        }),
      );
    });

    it('should throw NotFoundException if relation not found', async () => {
      mockUserStoreRepository.findOne.mockResolvedValue(null);

      await expect(service.remove('not-found')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
