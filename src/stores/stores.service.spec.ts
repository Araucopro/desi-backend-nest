import { Test, TestingModule } from '@nestjs/testing';
import { StoresService } from './stores.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Store, StoreType } from './entities/store.entity';
import { Repository } from 'typeorm';
import {
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';
import { EncryptionService } from '../common/services/encryption.service';
import * as crypto from 'crypto';

describe('StoresService', () => {
  let service: StoresService;
  let storeRepository: Repository<Store>;
  const testEncryptionKey = crypto.randomBytes(32).toString('hex');

  const mockStoreRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
  };

  const mockStore: Partial<Store> = {
    storeID: 'store-uuid-1',
    name: 'Test Store',
    email: 'store@example.com',
    location: 'Santiago',
    rut: '12345678-9',
    address: 'Av. Test 123',
    phone: '+56912345678',
    city: 'Santiago',
    type: StoreType.FRANCHISE,
    isCentralStore: false,
    userStores: [],
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StoresService,
        EncryptionService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'STORE_ENCRYPTION_KEY') return testEncryptionKey;
              return null;
            }),
          },
        },
        {
          provide: getRepositoryToken(Store),
          useValue: mockStoreRepository,
        },
      ],
    }).compile();

    service = module.get<StoresService>(StoresService);
    storeRepository = module.get<Repository<Store>>(getRepositoryToken(Store));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a store', async () => {
      const createDto = {
        name: 'New Store',
        email: 'new@store.com',
        location: 'Valparaíso',
        rut: '98765432-1',
        address: 'Calle Nueva 456',
        phone: '+56987654321',
        city: 'Valparaíso',
        type: StoreType.CONSIGNMENT,
      };

      mockStoreRepository.create.mockReturnValue(createDto);
      mockStoreRepository.save.mockResolvedValue({
        storeID: 'new-uuid',
        ...createDto,
      });

      const result = await service.create(createDto);

      expect(mockStoreRepository.create).toHaveBeenCalledWith(createDto);
      expect(mockStoreRepository.save).toHaveBeenCalled();
      expect(result.storeID).toBe('new-uuid');
    });
  });

  describe('findAll', () => {
    it('should return an array of stores', async () => {
      mockStoreRepository.find.mockResolvedValue([mockStore]);

      const result = await service.findAll();

      expect(result).toEqual([mockStore]);
      expect(mockStoreRepository.find).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return a store by ID', async () => {
      mockStoreRepository.findOne.mockResolvedValue(mockStore);

      const result = await service.findOne('store-uuid-1');

      expect(result).toEqual(mockStore);
      expect(mockStoreRepository.findOne).toHaveBeenCalledWith({
        where: { storeID: 'store-uuid-1' },
      });
    });

    it('should throw NotFoundException if store not found', async () => {
      mockStoreRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('not-found')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findUsersByStoreId', () => {
    it('should return users for a store', async () => {
      const storeWithUsers = {
        ...mockStore,
        userStores: [{ user: { userID: 'user-1', name: 'User 1' } }],
      };
      mockStoreRepository.findOne.mockResolvedValue(storeWithUsers);

      const result = await service.findUsersByStoreId('store-uuid-1');

      expect(result).toEqual([{ userID: 'user-1', name: 'User 1' }]);
    });

    it('should throw NotFoundException if store not found', async () => {
      mockStoreRepository.findOne.mockResolvedValue(null);

      await expect(service.findUsersByStoreId('not-found')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update a store', async () => {
      mockStoreRepository.findOne.mockResolvedValue({ ...mockStore });
      mockStoreRepository.save.mockResolvedValue({
        ...mockStore,
        name: 'Updated Store',
      });

      const result = await service.update('store-uuid-1', {
        name: 'Updated Store',
      });

      expect(result.name).toBe('Updated Store');
    });
  });

  describe('remove', () => {
    it('should remove a store', async () => {
      mockStoreRepository.findOne.mockResolvedValue(mockStore);
      mockStoreRepository.remove.mockResolvedValue(mockStore);

      await service.remove('store-uuid-1');

      expect(mockStoreRepository.remove).toHaveBeenCalledWith(mockStore);
    });

    it('should throw NotFoundException if store not found', async () => {
      mockStoreRepository.findOne.mockResolvedValue(null);

      await expect(service.remove('not-found')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('setOpenfacturaKey', () => {
    it('should encrypt and save the openfactura key', async () => {
      mockStoreRepository.findOne.mockResolvedValue({ ...mockStore });
      mockStoreRepository.save.mockImplementation((s) => Promise.resolve(s));

      const result = await service.setOpenfacturaKey(
        'store-uuid-1',
        'my-openfactura-key',
      );

      expect(result).toEqual({ hasOpenfacturaKey: true });
      expect(mockStoreRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          hasOpenfacturaKey: true,
          openfacturaKeyEncrypted: expect.any(String),
        }),
      );
    });
  });

  describe('resolveOpenfacturaKey', () => {
    it('should decrypt and return the store openfactura key if present', async () => {
      const qb = {
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn(),
      };
      (mockStoreRepository as any).createQueryBuilder = jest
        .fn()
        .mockReturnValue(qb);

      // First set the key to get a real encrypted string
      mockStoreRepository.findOne.mockResolvedValue({ ...mockStore });
      let savedStore: any = null;
      mockStoreRepository.save.mockImplementation((s) => {
        savedStore = s;
        return Promise.resolve(s);
      });
      await service.setOpenfacturaKey('store-uuid-1', 'secret-api-key-123');

      qb.getOne.mockResolvedValue(savedStore);

      const resolved = await service.resolveOpenfacturaKey('store-uuid-1');
      expect(resolved).toBe('secret-api-key-123');
    });

    it('should throw InternalServerErrorException if store has no encrypted key', async () => {
      const qb = {
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({
          ...mockStore,
          openfacturaKeyEncrypted: null,
        }),
      };
      (mockStoreRepository as any).createQueryBuilder = jest
        .fn()
        .mockReturnValue(qb);

      await expect(
        service.resolveOpenfacturaKey('store-uuid-1'),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });
});
