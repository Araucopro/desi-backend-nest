import { Test, TestingModule } from '@nestjs/testing';
import { StoreProductService } from './storeproduct.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { StoreProduct } from './entities/storeproduct.entity';
import { DataSource, Repository } from 'typeorm';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { Product } from '../../products/entities/product.entity';
import { Store } from '../../stores/entities/store.entity';
import { ProductVariation } from '../../products/entities/product-variation.entity';

describe('StoreProductService', () => {
  let service: StoreProductService;
  let storeStockRepository: Repository<StoreProduct>;
  let productRepository: Repository<Product>;

  const mockStoreStockRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
  };

  const mockProductRepository = {
    createQueryBuilder: jest.fn(),
  };

  const mockDataSource = {
    transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StoreProductService,
        {
          provide: getRepositoryToken(StoreProduct),
          useValue: mockStoreStockRepository,
        },
        {
          provide: getRepositoryToken(Product),
          useValue: mockProductRepository,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<StoreProductService>(StoreProductService);
    storeStockRepository = module.get<Repository<StoreProduct>>(
      getRepositoryToken(StoreProduct),
    );
    productRepository = module.get<Repository<Product>>(
      getRepositoryToken(Product),
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('update', () => {
    it('should update a store product', async () => {
      const existingSP = {
        storeProductID: 'sp-1',
        stock: 10,
        priceCost: 100,
        priceList: 150,
      } as StoreProduct;

      mockStoreStockRepository.findOne.mockResolvedValue(existingSP);
      mockStoreStockRepository.save.mockImplementation((sp) =>
        Promise.resolve(sp),
      );

      const result = await service.update('sp-1', {
        stock: 20,
        priceCost: 110,
        priceList: 160,
      });

      expect(result.stock).toBe(20);
      expect(result.priceCost).toBe(110);
      expect(result.priceList).toBe(160);
      expect(mockStoreStockRepository.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException if store product not found', async () => {
      mockStoreStockRepository.findOne.mockResolvedValue(null);

      await expect(service.update('not-found', {})).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('transferStock', () => {
    it('should perform stock transfer between stores', async () => {
      const mockManager = {
        findOne: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
      };

      mockDataSource.transaction.mockImplementation(async (cb) => {
        // Mock target store lookup
        mockManager.findOne.mockResolvedValueOnce({ storeID: 'target-1' });
        // Mock variation lookup
        mockManager.findOne.mockResolvedValueOnce({ variationID: 'var-1' });
        // Mock central store lookup
        mockManager.findOne.mockResolvedValueOnce({
          storeID: 'central-1',
          isCentralStore: true,
        });
        // Mock central stock lookup
        mockManager.findOne.mockResolvedValueOnce({
          storeProductID: 'sp-central',
          stock: 100,
        });
        // Mock target stock lookup (doesn't exist)
        mockManager.findOne.mockResolvedValueOnce(null);

        mockManager.create.mockReturnValue({
          store: { storeID: 'target-1' },
          variation: { variationID: 'var-1' },
          stock: 0,
        });

        return cb(mockManager);
      });

      await service.transferStock({
        targetStoreID: 'target-1',
        items: [{ variationID: 'var-1', stock: 10, priceCost: 50 }],
      });

      expect(mockDataSource.transaction).toHaveBeenCalled();
    });
  });
});
