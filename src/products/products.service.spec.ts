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

describe('ProductsService', () => {
  let service: ProductsService;
  let productRepository: Repository<Product>;
  let entityManager: EntityManager;

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
  };

  beforeEach(async () => {
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
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
    productRepository = module.get<Repository<Product>>(
      getRepositoryToken(Product),
    );
    entityManager = module.get<EntityManager>(EntityManager);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return an array of products with pagination', async () => {
      const result: Product[] = [];

      // Mock a query builder chain used by the service
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

  describe('update', () => {
    it('should update a product and its variations', async () => {
      const updateDto: UpdateProductDto = {
        name: 'Updated Product',
        variations: [
          {
            size: 'L',
            priceCost: 80,
            priceList: 100,
            stock: 10,
            sku: '123',
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
            stock: 5,
            priceCost: 50,
            priceList: 60,
          },
        ],
      };
      const updatedProduct = { ...existingProduct, ...updateDto };
      const centralStore = { storeID: 'central', isCentralStore: true };

      mockEntityManager.transaction.mockImplementation(async (cb) => {
        return cb(mockEntityManager as any);
      });

      // Mock findOne implementation to return correct entities
      mockEntityManager.findOne.mockImplementation((entity, options) => {
        if (entity === Product) return Promise.resolve(existingProduct);
        if (entity === Store) return Promise.resolve(centralStore);
        if (entity === StoreProduct) return Promise.resolve(null); // No existing StoreProduct
        return Promise.resolve(null);
      });

      mockEntityManager.save.mockImplementation((entity) =>
        Promise.resolve(entity),
      );

      // Mock findOne called at the end of update to return result
      jest.spyOn(service, 'findOne').mockResolvedValue(updatedProduct as any);

      const result = await service.update('1', updateDto);

      expect(mockEntityManager.transaction).toHaveBeenCalled();

      // Verify Store logic
      expect(mockEntityManager.findOne).toHaveBeenCalledWith(
        Store,
        expect.anything(),
      );
      // Should create StoreProduct
      expect(mockEntityManager.create).toHaveBeenCalledWith(
        StoreProduct,
        expect.objectContaining({
          store: { storeID: 'central' },
          stock: 10,
        }),
      );
    });

    it('should throw NotFoundException if product not found', async () => {
      mockEntityManager.transaction.mockImplementation(async (cb) => {
        return cb(mockEntityManager as any);
      });
      mockEntityManager.findOne.mockResolvedValue(null);

      await expect(service.update('1', {})).rejects.toThrow(NotFoundException);
    });
  });
});
