import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PricingService } from './pricing.service';
import { PriceHistory } from './entities/price-history.entity';
import { OfferService } from './offer.service';
import { MarginValidator } from './validators/margin.validator';
import { UserDiscountValidator } from './validators/user-discount.validator';
import { DiscountScope, DiscountType } from './entities/special-offer.entity';
import { StoreType } from '../stores/entities/store.entity';

describe('PricingService', () => {
  let service: PricingService;
  let dataSource: {
    manager: {
      findOne: jest.Mock;
    };
  };
  let offerService: { getBestOffer: jest.Mock };
  let userDiscountValidator: { validate: jest.Mock };
  let marginValidator: { validate: jest.Mock };
  let priceHistoryRepository: { createQueryBuilder: jest.Mock };

  beforeEach(async () => {
    dataSource = {
      manager: {
        findOne: jest.fn(),
      },
    };
    offerService = {
      getBestOffer: jest.fn(),
    };
    userDiscountValidator = {
      validate: jest.fn(),
    };
    marginValidator = {
      validate: jest.fn(),
    };
    priceHistoryRepository = {
      createQueryBuilder: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PricingService,
        {
          provide: getRepositoryToken(PriceHistory),
          useValue: priceHistoryRepository,
        },
        {
          provide: DataSource,
          useValue: dataSource,
        },
        {
          provide: OfferService,
          useValue: offerService,
        },
        {
          provide: MarginValidator,
          useValue: marginValidator,
        },
        {
          provide: UserDiscountValidator,
          useValue: userDiscountValidator,
        },
      ],
    }).compile();

    service = module.get<PricingService>(PricingService);
  });

  it('records automatic and manual discounts in a single trace', async () => {
    const storeProduct = {
      store: { storeID: 'store-1', type: StoreType.FRANCHISE },
      variation: {
        variationID: 'variation-1',
        product: { productID: 'product-1' },
      },
      priceCost: 40,
      priceList: 100,
    };

    dataSource.manager.findOne.mockResolvedValue(storeProduct);
    offerService.getBestOffer.mockResolvedValue({
      offerID: 'offer-1',
      description: 'Promo',
      discountType: DiscountType.PERCENTAGE,
      scope: DiscountScope.UNIT,
      value: 10,
      exclusive: false,
      priority: 0,
    });

    const result = await service.calculatePrice({
      storeProductID: 'sp-1',
      quantity: 2,
      userID: 'user-1',
      manualDiscount: 5,
    });

    expect(userDiscountValidator.validate).toHaveBeenCalledWith({
      userID: 'user-1',
      manualDiscount: 5,
      storeProduct,
      baseUnitPrice: 100,
      currentUnitPrice: 90,
      quantity: 2,
    });
    expect(result.finalPrice).toBe(171);
    expect(result.discountsApplied).toHaveLength(2);
    expect(result.pricingContext.storeID).toBe('store-1');
  });

  it('keeps manual discount as ignored when automatic offer is exclusive', async () => {
    dataSource.manager.findOne.mockResolvedValue({
      store: { storeID: 'store-2', type: StoreType.FRANCHISE },
      variation: {
        variationID: 'variation-2',
        product: { productID: 'product-2' },
      },
      priceCost: 40,
      priceList: 100,
    });
    offerService.getBestOffer.mockResolvedValue({
      offerID: 'offer-2',
      description: 'Exclusive',
      discountType: DiscountType.FIXED_PRICE,
      scope: DiscountScope.TOTAL,
      value: 70,
      exclusive: true,
      priority: 100,
    });

    const result = await service.calculatePrice({
      storeProductID: 'sp-2',
      quantity: 1,
      userID: 'user-2',
      manualDiscount: 5,
      baseUnitPrice: 100,
      priceCost: 40,
    });

    expect(userDiscountValidator.validate).not.toHaveBeenCalled();
    expect(result.finalPrice).toBe(70);
    expect(result.discountsApplied).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: 'AUTO', applied: true }),
        expect.objectContaining({
          source: 'MANUAL',
          applied: false,
          reasonIgnored: 'exclusive_offer',
        }),
      ]),
    );
  });

  it('falls back to the central store price when the local store price is empty', async () => {
    const franchiseStoreProduct = {
      store: { storeID: 'store-3', type: StoreType.FRANCHISE },
      variation: {
        variationID: 'variation-3',
        product: { productID: 'product-3' },
      },
      priceCost: 0,
      priceList: 0,
    };
    const centralStoreProduct = {
      store: { storeID: 'central-store', isCentralStore: true },
      variation: {
        variationID: 'variation-3',
        product: { productID: 'product-3' },
      },
      priceCost: 50,
      priceList: 120,
    };

    dataSource.manager.findOne
      .mockResolvedValueOnce(franchiseStoreProduct)
      .mockResolvedValueOnce(centralStoreProduct);
    offerService.getBestOffer.mockResolvedValue(null);

    const result = await service.calculatePrice({
      storeProductID: 'sp-3',
      quantity: 1,
    });

    expect(result.basePrice).toBe(120);
    expect(result.finalPrice).toBe(120);
    expect(marginValidator.validate).toHaveBeenCalledWith(50, 120);
  });

  it('lists price history with product and store context', async () => {
    const getMany = jest.fn().mockResolvedValue([
      {
        historyID: 'history-1',
        storeProduct: {
          storeProductID: 'sp-1',
          store: { storeID: 'store-1' },
          variation: {
            variationID: 'variation-1',
            product: { productID: 'product-1' },
          },
        },
      },
    ]);
    const queryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany,
    };
    priceHistoryRepository.createQueryBuilder.mockReturnValue(
      queryBuilder as never,
    );

    const result = await service.getPriceHistoryList({
      storeID: 'store-1',
      variationID: 'variation-1',
    });

    expect(priceHistoryRepository.createQueryBuilder).toHaveBeenCalledWith(
      'history',
    );
    expect(queryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
      'history.storeProduct',
      'storeProduct',
    );
    expect(result).toHaveLength(1);
    expect(result[0].storeProduct.variation.product.productID).toBe(
      'product-1',
    );
  });
});
