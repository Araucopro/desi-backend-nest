import { Test, TestingModule } from '@nestjs/testing';
import { ProductsService } from './products.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Product, ProductGenre } from './entities/product.entity';
import { ProductVariation } from './entities/product-variation.entity';
import { Store } from '../stores/entities/store.entity';
import { StoreProduct } from '../relations/storeproduct/entities/storeproduct.entity';
import { EntityManager, Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { UpdateProductDto } from './dto/update-product.dto';
import { PricingService } from '../pricing/pricing.service';
import { InventoryService } from '../inventory/inventory.service';
import {
  InventoryMovement,
  InventoryMovementReason,
} from '../inventory/entities/inventory-movement.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { Category } from '../categories/entities/category.entity';

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

  const mockCategoryRepository = {
    find: jest.fn(),
    save: jest.fn(),
  };

  const mockEntityManager = {
    transaction: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
    merge: jest.fn(),
    delete: jest.fn(),
    find: jest.fn(),
    remove: jest.fn(),
    getRepository: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockEntityManager.getRepository.mockImplementation((entity: unknown) => {
      if (entity === Category) return mockCategoryRepository;
      if (entity === ProductVariation) return mockVariationRepository;
      return mockProductRepository;
    });

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
        {
          provide: InventoryService,
          useValue: new InventoryService(undefined as any),
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
    it('returns products with pagination meta', async () => {
      const result: Product[] = [];
      mockEntityManager.transaction.mockImplementation(async (cb) =>
        cb(mockEntityManager as any),
      );

      const queryBuilderMock: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([result, 0]),
      };
      mockProductRepository.createQueryBuilder.mockReturnValue(
        queryBuilderMock,
      );

      const paginationDto = { limit: 10, offset: 0 };
      const res = await service.findAll(paginationDto);
      expect(res).toEqual({
        products: result,
        meta: { page: 1, limit: 10, total: 0 },
      });
      expect(mockProductRepository.createQueryBuilder).toHaveBeenCalledWith(
        'product',
      );
      expect(queryBuilderMock.getManyAndCount).toHaveBeenCalled();
    });

    it('applies a server-side search across product and variation fields', async () => {
      const result: Product[] = [];
      mockEntityManager.transaction.mockImplementation(async (cb) =>
        cb(mockEntityManager as any),
      );

      const queryBuilderMock: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([result, 1]),
      };
      mockProductRepository.createQueryBuilder.mockReturnValue(
        queryBuilderMock,
      );

      await service.findAll({ search: 'CEM-25' });

      expect(queryBuilderMock.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('"pv"."sku" ILIKE :term'),
        { term: '%CEM-25%' },
      );
    });

    it('filters products by exact barcode', async () => {
      const result: Product[] = [];
      mockEntityManager.transaction.mockImplementation(async (cb) =>
        cb(mockEntityManager as any),
      );

      const queryBuilderMock: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([result, 1]),
      };
      mockProductRepository.createQueryBuilder.mockReturnValue(
        queryBuilderMock,
      );

      await service.findAll({ barcode: '7801234567890' });

      expect(queryBuilderMock.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('"pv"."barcode" = :barcode'),
        { barcode: '7801234567890' },
      );
    });

    it('filters products by category and genre', async () => {
      const result: Product[] = [];
      mockEntityManager.transaction.mockImplementation(async (cb) =>
        cb(mockEntityManager as any),
      );

      const queryBuilderMock: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([result, 0]),
      };
      mockProductRepository.createQueryBuilder.mockReturnValue(
        queryBuilderMock,
      );

      await service.findAll({
        categoryID: 'category-1',
        genre: ProductGenre.UNISEX,
      });

      expect(queryBuilderMock.andWhere).toHaveBeenCalledWith(
        'product.categoryID = :categoryID',
        { categoryID: 'category-1' },
      );
      expect(queryBuilderMock.andWhere).toHaveBeenCalledWith(
        'product.genre = :genre',
        { genre: ProductGenre.UNISEX },
      );
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
      mockEntityManager.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        setLock: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      });

      const result = await service.create(dto);

      expect(result).toEqual(expect.objectContaining({ name: 'New Product' }));
      expect(mockEntityManager.save).toHaveBeenCalledWith(
        expect.objectContaining({
          sku: 'SKU-1',
          barcode: 'SKU-1',
          product: expect.anything(),
        }),
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

  describe('bulkUpsert', () => {
    it('creates new products, auto-creates missing categories and registers movements', async () => {
      mockEntityManager.transaction.mockImplementation(async (cb) =>
        cb(mockEntityManager as any),
      );
      mockCategoryRepository.find.mockResolvedValue([]);
      mockProductRepository.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      });
      mockEntityManager.find.mockResolvedValue([]);
      mockEntityManager.findOne.mockImplementation((entity: unknown) => {
        if (entity === Store) {
          return { storeID: 'central-1', isCentralStore: true };
        }
        if (entity === Product) {
          return {
            productID: 'product-1',
            name: 'Camiseta Básica',
            category: { categoryID: 'cat-1', name: 'Vestuario' },
            variations: [{ variationID: 'variation-1', sku: 'CAM-BAS-L' }],
          };
        }
        return null;
      });
      mockEntityManager.create.mockImplementation(
        (_entity: unknown, values: object) => ({ ...values }),
      );
      mockEntityManager.save.mockImplementation(async (entity: unknown) => {
        if (Array.isArray(entity)) {
          return entity.map((item, index) => ({
            categoryID: `cat-${index + 1}`,
            ...item,
          }));
        }
        const candidate = entity as {
          productID?: string;
          variationID?: string;
        };
        candidate.productID ??= 'product-1';
        candidate.variationID ??= 'variation-1';
        return entity;
      });
      mockEntityManager.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        setLock: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      });

      const result = await service.bulkUpsert({
        items: [
          {
            name: 'Camiseta Básica',
            categoryName: 'Vestuario',
            variations: [
              {
                sku: 'CAM-BAS-L',
                priceCost: 8000,
                priceList: 15000,
                stock: 50,
              },
            ],
          },
        ],
      });

      expect(result).toHaveLength(1);
      expect(result[0].productID).toBe('product-1');
      expect(mockEntityManager.save).toHaveBeenCalledWith([
        expect.objectContaining({ name: 'Vestuario' }),
      ]);
      expect(mockEntityManager.create).toHaveBeenCalledWith(
        InventoryMovement,
        expect.objectContaining({
          store: { storeID: 'central-1' },
          variation: { variationID: 'variation-1' },
          delta: 50,
          reason: InventoryMovementReason.ADJUSTMENT,
          referenceID: 'product-1',
        }),
      );
    });

    it('reuses an existing category matching case-insensitively', async () => {
      mockEntityManager.transaction.mockImplementation(async (cb) =>
        cb(mockEntityManager as any),
      );
      mockCategoryRepository.find.mockResolvedValue([
        { categoryID: 'cat-1', name: 'Vestuario' },
      ]);
      mockProductRepository.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      });
      mockEntityManager.find.mockResolvedValue([]);
      mockEntityManager.findOne.mockImplementation((entity: unknown) => {
        if (entity === Store) {
          return { storeID: 'central-1', isCentralStore: true };
        }
        if (entity === Product) {
          return {
            productID: 'product-1',
            name: 'Camiseta',
            categoryID: 'cat-1',
            category: { categoryID: 'cat-1', name: 'Vestuario' },
            variations: [],
          };
        }
        return null;
      });
      mockEntityManager.create.mockImplementation(
        (_entity: unknown, values: object) => ({ ...values }),
      );
      mockEntityManager.save.mockImplementation(
        async (entity: unknown) => entity,
      );
      mockEntityManager.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        setLock: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      });

      const result = await service.bulkUpsert({
        items: [
          {
            name: 'Camiseta',
            categoryName: '  vestuario ',
            variations: [
              {
                sku: 'CAM-1',
                priceCost: 5000,
                priceList: 9000,
                stock: 10,
              },
            ],
          },
        ],
      });

      expect(result[0].categoryID).toBe('cat-1');
      expect(mockEntityManager.save).not.toHaveBeenCalledWith(
        expect.any(Array),
      );
    });

    it('updates an existing product by name and applies the variation plan', async () => {
      const existingProduct = {
        productID: 'product-1',
        name: 'Camiseta Básica',
        categoryID: 'cat-1',
        variations: [
          {
            variationID: 'v1',
            sku: 'SKU-1',
            product: { productID: 'product-1' },
          },
          {
            variationID: 'vOld',
            sku: 'SKU-OLD',
            product: { productID: 'product-1' },
          },
        ],
      };

      mockEntityManager.transaction.mockImplementation(async (cb) =>
        cb(mockEntityManager as any),
      );
      mockCategoryRepository.find.mockResolvedValue([
        { categoryID: 'cat-1', name: 'Vestuario' },
      ]);
      mockProductRepository.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest
          .fn()
          .mockResolvedValue([
            { productID: 'product-1', name: 'Camiseta Básica' },
          ]),
      });
      mockEntityManager.find.mockImplementation((entity: unknown) =>
        entity === ProductVariation
          ? [{ sku: 'SKU-1', product: { productID: 'product-1' } }]
          : [],
      );
      mockEntityManager.findOne.mockImplementation(
        (entity: unknown, options?: { relations?: string[] }) => {
          if (entity === Store) {
            return { storeID: 'central-1', isCentralStore: true };
          }
          if (entity === Product) {
            const isFinalReload =
              Array.isArray(options?.relations) &&
              (options?.relations?.length ?? 0) > 1;
            if (isFinalReload) {
              return {
                ...existingProduct,
                category: { categoryID: 'cat-1', name: 'Vestuario' },
                variations: [
                  { variationID: 'v1', sku: 'SKU-1' },
                  { variationID: 'v2', sku: 'SKU-2' },
                ],
              };
            }
            return existingProduct;
          }
          return null;
        },
      );
      mockEntityManager.merge.mockImplementation(
        (_entity: unknown, target: object, source: object) =>
          Object.assign(target, source),
      );
      mockEntityManager.create.mockImplementation(
        (_entity: unknown, values: object) => ({ ...values }),
      );
      mockEntityManager.save.mockImplementation(async (entity: unknown) => {
        const candidate = entity as { variationID?: string };
        candidate.variationID ??= 'v2';
        return entity;
      });
      mockEntityManager.remove.mockResolvedValue(undefined);
      mockEntityManager.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        setLock: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({
          storeProductID: 'sp-1',
          tenantID: 'tenant-1',
          stock: 5,
          priceCost: 50,
          priceList: 60,
        }),
      });

      const result = await service.bulkUpsert({
        items: [
          {
            name: 'Camiseta Básica',
            categoryName: 'Vestuario',
            variations: [
              {
                sku: 'SKU-1',
                priceCost: 9000,
                priceList: 15000,
                stock: 20,
              },
              {
                sku: 'SKU-2',
                priceCost: 7000,
                priceList: 12000,
                stock: 15,
              },
            ],
          },
        ],
      });

      expect(result).toHaveLength(1);
      expect(mockEntityManager.merge).toHaveBeenCalledWith(
        Product,
        existingProduct,
        expect.objectContaining({
          name: 'Camiseta Básica',
          categoryID: 'cat-1',
        }),
      );
      expect(pricingService.applyPriceChange).toHaveBeenCalledTimes(2);
      expect(mockEntityManager.remove).toHaveBeenCalledWith(
        expect.objectContaining({ variationID: 'vOld' }),
      );
    });

    it('skips inventory movements when there is no central store', async () => {
      mockEntityManager.transaction.mockImplementation(async (cb) =>
        cb(mockEntityManager as any),
      );
      mockCategoryRepository.find.mockResolvedValue([]);
      mockProductRepository.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      });
      mockEntityManager.find.mockResolvedValue([]);
      mockEntityManager.findOne.mockImplementation((entity: unknown) => {
        if (entity === Store) return null;
        if (entity === Product) {
          return {
            productID: 'product-1',
            name: 'Camiseta',
            variations: [{ variationID: 'variation-1', sku: 'CAM-1' }],
          };
        }
        return null;
      });
      mockEntityManager.create.mockImplementation(
        (_entity: unknown, values: object) => ({ ...values }),
      );
      mockEntityManager.save.mockImplementation(async (entity: unknown) => {
        const candidate = entity as {
          productID?: string;
          variationID?: string;
        };
        candidate.productID ??= 'product-1';
        candidate.variationID ??= 'variation-1';
        return entity;
      });

      const result = await service.bulkUpsert({
        items: [
          {
            name: 'Camiseta',
            variations: [
              { sku: 'CAM-1', priceCost: 5000, priceList: 9000, stock: 10 },
            ],
          },
        ],
      });

      expect(result).toHaveLength(1);
      expect(mockEntityManager.create).not.toHaveBeenCalledWith(
        InventoryMovement,
        expect.anything(),
      );
    });

    it('rejects duplicate product names before starting the transaction', async () => {
      const variation = {
        sku: 'SKU-1',
        priceCost: 5000,
        priceList: 9000,
        stock: 10,
      };

      await expect(
        service.bulkUpsert({
          items: [
            { name: 'Camisa', variations: [variation] },
            { name: ' camisa ', variations: [variation] },
          ],
        }),
      ).rejects.toThrow('duplicado');

      expect(mockEntityManager.transaction).not.toHaveBeenCalled();
    });

    it('rejects duplicate SKUs across products before starting the transaction', async () => {
      const variation = {
        sku: 'SKU-1',
        priceCost: 5000,
        priceList: 9000,
        stock: 10,
      };

      await expect(
        service.bulkUpsert({
          items: [
            { name: 'Camisa', variations: [variation] },
            { name: 'Polera', variations: [variation] },
          ],
        }),
      ).rejects.toThrow('duplicado');

      expect(mockEntityManager.transaction).not.toHaveBeenCalled();
    });

    it('rejects a SKU that already belongs to another product', async () => {
      mockEntityManager.transaction.mockImplementation(async (cb) =>
        cb(mockEntityManager as any),
      );
      mockCategoryRepository.find.mockResolvedValue([]);
      mockProductRepository.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      });
      mockEntityManager.find.mockResolvedValue([
        { sku: 'SKU-1', product: { productID: 'other-1' } },
      ]);

      await expect(
        service.bulkUpsert({
          items: [
            {
              name: 'Camisa',
              variations: [
                { sku: 'SKU-1', priceCost: 5000, priceList: 9000, stock: 10 },
              ],
            },
          ],
        }),
      ).rejects.toThrow('ya pertenece');

      expect(mockEntityManager.transaction).toHaveBeenCalled();
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
      mockEntityManager.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        setLock: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(existingSP),
      });

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
