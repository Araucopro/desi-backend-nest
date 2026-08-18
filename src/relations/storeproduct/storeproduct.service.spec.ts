import { Test, TestingModule } from '@nestjs/testing';
import { StoreProductService } from './storeproduct.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { StoreProduct } from './entities/storeproduct.entity';
import { DataSource, Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { Product } from '../../products/entities/product.entity';
import { PricingService } from '../../pricing/pricing.service';
import {
  InventoryMovement,
  InventoryMovementReason,
} from '../../inventory/entities/inventory-movement.entity';

describe('StoreProductService', () => {
  let service: StoreProductService;
  let productRepository: Repository<Product>;
  let pricingService: {
    calculatePrice: jest.Mock;
    applyPriceChange: jest.Mock;
  };

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

  const mockManager = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    pricingService = {
      calculatePrice: jest.fn(),
      applyPriceChange: jest.fn().mockResolvedValue({ historyID: 'history-1' }),
    };
    mockManager.create.mockImplementation(
      (_entity: unknown, values: object) => ({ ...values }),
    );
    mockManager.save.mockImplementation(async (entity: unknown) => entity);
    mockDataSource.transaction.mockImplementation(async (cb) =>
      cb(mockManager),
    );

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
        {
          provide: PricingService,
          useValue: pricingService,
        },
      ],
    }).compile();

    service = module.get<StoreProductService>(StoreProductService);
    productRepository = module.get<Repository<Product>>(
      getRepositoryToken(Product),
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('update', () => {
    it('updates stock through an ADJUSTMENT movement and prices through PricingService', async () => {
      const existingSP = {
        storeProductID: 'sp-1',
        tenantID: 'tenant-1',
        stock: 10,
        priceCost: 100,
        priceList: 150,
        store: { storeID: 'store-1' },
        variation: { variationID: 'var-1' },
      };
      mockManager.findOne.mockResolvedValue(existingSP);

      const result = await service.update('sp-1', {
        stock: 20,
        priceCost: 110,
        priceList: 160,
      });

      expect(mockManager.findOne).toHaveBeenCalledWith(
        StoreProduct,
        expect.objectContaining({
          where: { storeProductID: 'sp-1' },
          lock: { mode: 'pessimistic_write' },
        }),
      );
      expect(mockManager.create).toHaveBeenCalledWith(
        InventoryMovement,
        expect.objectContaining({
          store: { storeID: 'store-1' },
          variation: { variationID: 'var-1' },
          delta: 10,
          reason: InventoryMovementReason.ADJUSTMENT,
          referenceID: 'sp-1',
        }),
      );
      expect(pricingService.applyPriceChange).toHaveBeenCalledTimes(2);
      expect(pricingService.applyPriceChange).toHaveBeenCalledWith(
        mockManager,
        existingSP,
        expect.objectContaining({
          priceType: 'cost',
          oldPrice: 100,
          newPrice: 110,
        }),
      );
      expect(result).toEqual(expect.objectContaining({ stock: 20 }));
    });

    it('should throw NotFoundException if store product not found', async () => {
      mockManager.findOne.mockResolvedValue(null);

      await expect(service.update('not-found', {})).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getStoreInventory', () => {
    it('calculates prices only through PricingService', async () => {
      const product = {
        productID: 'product-1',
        name: 'Producto A',
        variations: [
          {
            variationID: 'var-1',
            storeProducts: [
              {
                storeProductID: 'sp-1',
                priceCost: 100,
                priceList: 150,
              },
            ],
          },
        ],
      };
      const queryBuilderMock: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        innerJoinAndSelect: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([product]),
      };
      mockProductRepository.createQueryBuilder.mockReturnValue(
        queryBuilderMock,
      );
      pricingService.calculatePrice.mockResolvedValue({
        finalPrice: 140,
        discountApplied: true,
        discountsApplied: [],
        discountDetails: null,
        breakdown: [],
      });

      const result = await service.getStoreInventory('store-1');

      expect(pricingService.calculatePrice).toHaveBeenCalledWith({
        storeProductID: 'sp-1',
        quantity: 1,
      });
      expect(result[0].variations[0].storeProducts[0]).toEqual(
        expect.objectContaining({
          finalPrice: 140,
          discountApplied: true,
        }),
      );
    });

    it('filters inventory by search across product and variation fields', async () => {
      const queryBuilderMock: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        innerJoinAndSelect: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      mockProductRepository.createQueryBuilder.mockReturnValue(
        queryBuilderMock,
      );

      await service.getStoreInventory('store-1', '7801234567890');

      expect(queryBuilderMock.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('variations.barcode ILIKE :term'),
        { term: '%7801234567890%' },
      );
    });

    it('filters inventory by exact barcode for scanner support', async () => {
      const queryBuilderMock: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        innerJoinAndSelect: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      mockProductRepository.createQueryBuilder.mockReturnValue(
        queryBuilderMock,
      );

      await service.getStoreInventory('store-1', undefined, '7801234567890');

      expect(queryBuilderMock.andWhere).toHaveBeenCalledWith(
        'variations.barcode = :barcode',
        { barcode: '7801234567890' },
      );
    });
  });
});
