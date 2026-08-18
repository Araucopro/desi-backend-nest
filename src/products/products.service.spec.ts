import { Test, TestingModule } from '@nestjs/testing';
import { ProductsService } from './products.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Product } from './entities/product.entity';
import { ProductVariation } from './entities/product-variation.entity';
import { Store } from '../stores/entities/store.entity';
import { StoreProduct } from '../relations/storeproduct/entities/storeproduct.entity';
import { EntityManager, Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { UpdateProductDto } from './dto/update-product.dto';
import { PricingService } from '../pricing/pricing.service';
import {
  InventoryMovement,
  InventoryMovementReason,
} from '../inventory/entities/inventory-movement.entity';
import { CreateProductDto } from './dto/create-product.dto';

describe('ProductsService', () => {
  let service: ProductsService;
  let entityManager: EntityManager;
  let pricingService: {
    calculatePrice: jest.Mock;
    applyPriceChange: jest.Mock;
  };

  const mockProductRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    merge: jest.fn(),
    remove: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockVariationRepository = {
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockEntityManager = {
    transaction: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    merge: jest.fn(),
    delete: jest.fn(),
    find: jest.fn(),
    remove: jest.fn(),
    getRepository: jest.fn().mockReturnValue(mockProductRepository),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    pricingService = {
      calculatePrice: jest.fn(),
      applyPriceChange: jest.fn().mockResolvedValue({ historyID: 'history-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        {
          provide: getRepositoryToken(Product),
          useValue: mockProductRepository as any,
        },
        {
          provide: getRepositoryToken(ProductVariation),
          useValue: mockVariationRepository as any,
        },
        {
          provide: EntityManager,
          useValue: mockEntityManager as any,
        },
        {
          provide: PricingService,
          useValue: pricingService,
        },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
    entityManager = module.get<EntityManager>(EntityManager);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return an array of products with pagination', async () => {
      const result: Product[] = [];
      mockEntityManager.transaction.mockImplementation(async (cb) =>
        cb(mockEntityManager as any),
      );

      const queryBuilderMock: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(result),
      };
      mockProductRepository.createQueryBuilder.mockReturnValue(
        queryBuilderMock,
      );

      const paginationDto = { limit: 10, offset: 0 };
      const res = await service.findAll(paginationDto);
      expect(res).toBe(result);
      expect(mockProductRepository.createQueryBuilder).toHaveBeenCalledWith(
        'product',
      );
      expect(queryBuilderMock.getMany).toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('creates the central StoreProduct and registers an ADJUSTMENT movement', async () => {
      const dto: CreateProductDto = {
        name: 'New Product',
        variations: [
          {
            sku: 'SKU-1',
            priceCost: 80,
            priceList: 120,
            stock: 10,
          },
        ],
      };
      const centralStore = { storeID: 'central-1', isCentralStore: true };

      mockEntityManager.transaction.mockImplementation(async (cb) =>
        cb(mockEntityManager as any),
      );
      mockEntityManager.findOne.mockImplementation((entity: unknown) =>
        entity === Store ? centralStore : null,
      );
      mockEntityManager.create.mockImplementation(
        (_entity: unknown, values: object) => ({ ...values }),
      );
      mockEntityManager.save.mockImplementation(async (entity: unknown) => {
        const candidate = entity as {
          variationID?: string;
          productID?: string;
        };
        if (!candidate.variationID) candidate.productID ??= 'product-1';
        if (candidate.productID && !candidate.variationID) {
          candidate.variationID = 'variation-1';
        }
        return entity;
      });

      const result = await service.create(dto);

      expect(result).toEqual(expect.objectContaining({ name: 'New Product' }));
      expect(mockEntityManager.save).toHaveBeenCalledWith(
        expect.objectContaining({ sku: 'SKU-1', product: expect.anything() }),
      );
      expect(mockEntityManager.create).toHaveBeenCalledWith(
        InventoryMovement,
        expect.objectContaining({
          store: { storeID: 'central-1' },
          variation: { variationID: 'variation-1' },
          delta: 10,
          reason: InventoryMovementReason.ADJUSTMENT,
        }),
      );
      expect(pricingService.applyPriceChange).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('updates stock and delegates price changes to PricingService', async () => {
      const updateDto: UpdateProductDto = {
        name: 'Updated Product',
        variations: [
          {
            sku: '123',
            priceCost: 80,
            priceList: 100,
            stock: 10,
          },
        ],
      };
      const existingProduct = {
        productID: '1',
        name: 'Old Product',
        variations: [
          {
            variationID: 'v1',
            sku: '123',
            product: { productID: '1' },
          },
        ],
      };
      const centralStore = { storeID: 'central', isCentralStore: true };
      const existingSP = {
        storeProductID: 'sp-1',
        tenantID: 'tenant-1',
        stock: 5,
        priceCost: 50,
        priceList: 60,
      };

      mockEntityManager.transaction.mockImplementation(async (cb) =>
        cb(mockEntityManager as any),
      );
      mockEntityManager.findOne.mockImplementation((entity: unknown) => {
        if (entity === Product) return Promise.resolve(existingProduct);
        if (entity === Store) return Promise.resolve(centralStore);
        if (entity === StoreProduct) return Promise.resolve(existingSP);
        return Promise.resolve(null);
      });
      mockEntityManager.create.mockImplementation(
        (_entity: unknown, values: object) => ({ ...values }),
      );
      mockEntityManager.save.mockImplementation(
        async (entity: unknown) => entity,
      );
      mockEntityManager.merge.mockImplementation(() => undefined);

      const result = await service.update('1', updateDto);

      expect(result).toBeDefined();
      expect(pricingService.applyPriceChange).toHaveBeenCalledTimes(2);
      expect(pricingService.applyPriceChange).toHaveBeenCalledWith(
        mockEntityManager,
        existingSP,
        expect.objectContaining({
          priceType: 'cost',
          oldPrice: 50,
          newPrice: 80,
        }),
      );
      expect(mockEntityManager.create).toHaveBeenCalledWith(
        InventoryMovement,
        expect.objectContaining({
          store: { storeID: 'central' },
          variation: { variationID: 'v1' },
          delta: 5,
          reason: InventoryMovementReason.ADJUSTMENT,
        }),
      );
    });

    it('should throw NotFoundException if product not found', async () => {
      mockEntityManager.transaction.mockImplementation(async (cb) =>
        cb(mockEntityManager as any),
      );
      mockEntityManager.findOne.mockResolvedValue(null);

      await expect(service.update('1', {})).rejects.toThrow(NotFoundException);
    });
  });
});
