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
    });

    it('should throw ConflictException if relation already exists', async () => {
      mockUsersService.findOneById.mockResolvedValue(mockUser);
      mockStoresService.findOne.mockResolvedValue(mockStore);
      mockUserStoreRepository.findOne.mockResolvedValue(mockUserStore);

      await expect(
        service.create({ userID: 'user-uuid-1', storeID: 'store-uuid-1' }),
      ).rejects.toThrow(ConflictException);
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
        where: { user: { userID: 'user-uuid-1' } },
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
        where: { store: { storeID: 'store-uuid-1' } },
        relations: ['user'],
      });
    });
  });

  describe('remove', () => {
    it('should remove a user-store relation', async () => {
      mockUserStoreRepository.findOne.mockResolvedValue(mockUserStore);
      mockUserStoreRepository.remove.mockResolvedValue(mockUserStore);

      await service.remove('userstore-uuid-1');

      expect(mockUserStoreRepository.remove).toHaveBeenCalledWith(
        mockUserStore,
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
