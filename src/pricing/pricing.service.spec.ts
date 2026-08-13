import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PricingService } from './pricing.service';
import { PriceHistory } from './entities/price-history.entity';
import { OfferService } from './offer.service';
import { MarginValidator } from './validators/margin.validator';
import { UserDiscountValidator } from './validators/user-discount.validator';
import {
  DiscountScope,
  DiscountType,
  OfferTargetScope,
  SpecialOffer,
} from './entities/special-offer.entity';
import { StoreProduct } from '../relations/storeproduct/entities/storeproduct.entity';
import { StoreType } from '../stores/entities/store.entity';

describe('PricingService', () => {
  let service: PricingService;
  let manager: {
    findOne: jest.Mock;
    find: jest.Mock;
  };
  let dataSource: {
    transaction: jest.Mock;
    manager: typeof manager;
  };
  let offerService: {
    getApplicableOffers: jest.Mock;
    getApplicableStoreProductIDs: jest.Mock;
  };
  let userDiscountValidator: { validate: jest.Mock };
  let marginValidator: { validate: jest.Mock };
  let priceHistoryRepository: { createQueryBuilder: jest.Mock };

  function storeProduct(partial: Partial<StoreProduct> = {}): StoreProduct {
    return {
      storeProductID: partial.storeProductID ?? 'sp-1',
      tenantID: 'tenant-1',
      priceCost: partial.priceCost ?? 100,
      priceList: partial.priceList ?? 1000,
      stock: 10,
      store: {
        storeID: 'store-1',
        type: StoreType.FRANCHISE,
      } as StoreProduct['store'],
      variation: {
        variationID: 'variation-1',
        sku: 'SKU-1',
        product: {
          productID: 'product-1',
          name: 'Producto A',
          brand: 'MarcaX',
          category: { categoryID: 'category-1' },
        },
      } as StoreProduct['variation'],
      ...partial,
    } as StoreProduct;
  }

  function offer(partial: Partial<SpecialOffer>): SpecialOffer {
    return {
      offerID: 'offer-1',
      tenantID: 'tenant-1',
      targetScope: OfferTargetScope.STORE,
      storeProductID: null,
      storeID: 'store-1',
      includeSubcategories: true,
      priority: 0,
      description: 'Promo',
      discountType: DiscountType.PERCENTAGE,
      value: 10,
      scope: DiscountScope.UNIT,
      exclusive: false,
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      isActive: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      productTargets: [],
      bundleItems: [],
      ...partial,
    } as SpecialOffer;
  }

  beforeEach(async () => {
    manager = {
      findOne: jest.fn(),
      find: jest.fn(),
    };
    dataSource = {
      transaction: jest.fn((cb) => cb(manager)),
      manager,
    };
    offerService = {
      getApplicableOffers: jest.fn(),
      getApplicableStoreProductIDs: jest.fn(),
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

  function mockSingleLineStoreProduct(row: StoreProduct) {
    manager.findOne.mockResolvedValue(row);
    manager.find.mockResolvedValue([row]);
  }

  it('records automatic and manual discounts in a single trace', async () => {
    const spRow = storeProduct({ priceCost: 40, priceList: 100 });
    mockSingleLineStoreProduct(spRow);
    offerService.getApplicableOffers.mockResolvedValue([
      offer({
        offerID: 'offer-1',
        discountType: DiscountType.PERCENTAGE,
        value: 10,
      }),
    ]);
    offerService.getApplicableStoreProductIDs.mockResolvedValue(
      new Set(['sp-1']),
    );

    const result = await service.calculatePrice({
      storeProductID: 'sp-1',
      quantity: 2,
      userID: 'user-1',
      manualDiscount: 5,
    });

    expect(userDiscountValidator.validate).toHaveBeenCalledWith({
      userID: 'user-1',
      manualDiscount: 5,
      storeProduct: spRow,
      baseUnitPrice: 100,
      currentUnitPrice: 90,
      quantity: 2,
    });
    expect(result.finalPrice).toBe(171);
    expect(result.discountsApplied).toHaveLength(2);
    expect(result.pricingContext.storeID).toBe('store-1');
  });

  it('keeps manual discount as ignored when automatic offer is exclusive', async () => {
    mockSingleLineStoreProduct(
      storeProduct({
        storeProductID: 'sp-2',
        priceCost: 40,
        priceList: 100,
      }),
    );
    offerService.getApplicableOffers.mockResolvedValue([
      offer({
        offerID: 'offer-2',
        discountType: DiscountType.FIXED_PRICE,
        scope: DiscountScope.TOTAL,
        value: 70,
        exclusive: true,
      }),
    ]);
    offerService.getApplicableStoreProductIDs.mockResolvedValue(
      new Set(['sp-2']),
    );

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
    const franchise = storeProduct({
      storeProductID: 'sp-3',
      priceCost: 0,
      priceList: 0,
      variation: {
        variationID: 'variation-3',
        sku: 'SKU-3',
        product: {
          productID: 'product-3',
          name: 'Producto C',
        },
      } as StoreProduct['variation'],
    });
    const central = storeProduct({
      storeProductID: 'sp-central',
      store: {
        storeID: 'central-store',
        isCentralStore: true,
        type: StoreType.CENTRAL,
      } as StoreProduct['store'],
      variation: {
        variationID: 'variation-3',
        product: {
          productID: 'product-3',
          name: 'Producto C',
        },
      } as StoreProduct['variation'],
      priceCost: 50,
      priceList: 120,
    });
    manager.findOne.mockResolvedValue(franchise);
    manager.find.mockImplementation((_entity: unknown, options?: unknown) => {
      const where = (options as { where?: { store?: { isCentralStore?: boolean } } })
        ?.where;
      return Promise.resolve(where?.store?.isCentralStore ? [central] : [franchise]);
    });
    offerService.getApplicableOffers.mockResolvedValue([]);
    offerService.getApplicableStoreProductIDs.mockResolvedValue(new Set());

    const result = await service.calculatePrice({
      storeProductID: 'sp-3',
      quantity: 1,
    });

    expect(result.basePrice).toBe(120);
    expect(result.finalPrice).toBe(120);
    expect(marginValidator.validate).toHaveBeenCalledWith(50, 120);
  });

  it('calculates cart totals applying offers by priority with rounding', async () => {
    const sp1 = storeProduct({
      storeProductID: 'sp-1',
      priceCost: 100,
      priceList: 1000,
    });
    const sp2 = storeProduct({
      storeProductID: 'sp-2',
      priceCost: 100,
      priceList: 500,
      variation: {
        variationID: 'variation-2',
        sku: 'SKU-2',
        product: {
          productID: 'product-2',
          name: 'Producto B',
        },
      } as StoreProduct['variation'],
    });
    manager.findOne.mockResolvedValue(sp1);
    manager.find.mockResolvedValue([sp1, sp2]);
    offerService.getApplicableOffers.mockResolvedValue([
      offer({
        offerID: 'pct-offer',
        discountType: DiscountType.PERCENTAGE,
        value: 10,
        priority: 1,
      }),
      offer({
        offerID: 'amount-offer',
        discountType: DiscountType.FIXED_AMOUNT,
        scope: DiscountScope.TOTAL,
        value: 100,
        priority: 2,
      }),
    ]);
    offerService.getApplicableStoreProductIDs.mockImplementation(
      async (currentOffer: SpecialOffer) =>
        new Set(
          currentOffer.offerID === 'amount-offer'
            ? ['sp-1', 'sp-2']
            : ['sp-1', 'sp-2'],
        ),
    );

    const result = await service.calculateCart({
      storeID: 'store-1',
      items: [
        { storeProductID: 'sp-1', quantity: 2 },
        { storeProductID: 'sp-2', quantity: 1 },
      ],
    });

    expect(result.totals.subtotal).toBe(2500);
    expect(result.totals.discount).toBe(450);
    expect(result.totals.total).toBe(2050);
    expect(result.items[0].lineTotal).toBe(1700);
    expect(result.items[1].lineTotal).toBe(350);
  });

  it('applies 2x1 discount to the cheapest eligible unit', async () => {
    const sp1 = storeProduct({
      storeProductID: 'sp-1',
      priceCost: 0,
      priceList: 1000,
    });
    const sp2 = storeProduct({
      storeProductID: 'sp-2',
      priceCost: 0,
      priceList: 2000,
      variation: {
        variationID: 'variation-2',
        sku: 'SKU-2',
        product: {
          productID: 'product-2',
          name: 'Producto B',
        },
      } as StoreProduct['variation'],
    });
    manager.findOne.mockResolvedValue(sp1);
    manager.find.mockResolvedValue([sp1, sp2]);
    offerService.getApplicableOffers.mockResolvedValue([
      offer({
        offerID: 'buy-offer',
        discountType: DiscountType.BUY_X_GET_Y,
        buyQuantity: 2,
        payQuantity: 1,
        priority: 0,
      }),
    ]);
    offerService.getApplicableStoreProductIDs.mockResolvedValue(
      new Set(['sp-1', 'sp-2']),
    );

    const result = await service.calculateCart({
      storeID: 'store-1',
      items: [
        { storeProductID: 'sp-1', quantity: 1 },
        { storeProductID: 'sp-2', quantity: 1 },
      ],
    });

    expect(result.totals.total).toBe(2000);
    expect(result.items[0].lineTotal).toBe(0);
    expect(result.items[1].lineTotal).toBe(2000);
  });

  it('applies 3x2 and 6x5 as one free unit per complete group', async () => {
    const sp = storeProduct({
      storeProductID: 'sp-1',
      priceCost: 0,
      priceList: 100,
    });
    manager.findOne.mockResolvedValue(sp);
    manager.find.mockResolvedValue([sp]);
    offerService.getApplicableStoreProductIDs.mockResolvedValue(
      new Set(['sp-1']),
    );

    offerService.getApplicableOffers.mockResolvedValue([
      offer({
        offerID: 'three-for-two',
        discountType: DiscountType.BUY_X_GET_Y,
        buyQuantity: 3,
        payQuantity: 2,
      }),
    ]);
    const threeForTwo = await service.calculateCart({
      storeID: 'store-1',
      items: [{ storeProductID: 'sp-1', quantity: 3 }],
    });
    expect(threeForTwo.totals.total).toBe(200);

    offerService.getApplicableOffers.mockResolvedValue([
      offer({
        offerID: 'six-for-five',
        discountType: DiscountType.BUY_X_GET_Y,
        buyQuantity: 6,
        payQuantity: 5,
      }),
    ]);
    const sixForFive = await service.calculateCart({
      storeID: 'store-1',
      items: [{ storeProductID: 'sp-1', quantity: 6 }],
    });
    expect(sixForFive.totals.total).toBe(500);
  });

  it('applies bundle discount once per complete set and frees the cheapest line', async () => {
    const spA = storeProduct({
      storeProductID: 'sp-a',
      priceCost: 0,
      priceList: 1000,
      variation: {
        variationID: 'variation-a',
        sku: 'SKU-A',
        product: {
          productID: 'product-a',
          name: 'Producto A',
        },
      } as StoreProduct['variation'],
    });
    const spB = storeProduct({
      storeProductID: 'sp-b',
      priceCost: 0,
      priceList: 2000,
      variation: {
        variationID: 'variation-b',
        sku: 'SKU-B',
        product: {
          productID: 'product-b',
          name: 'Producto B',
        },
      } as StoreProduct['variation'],
    });
    const spC = storeProduct({
      storeProductID: 'sp-c',
      priceCost: 0,
      priceList: 500,
      variation: {
        variationID: 'variation-c',
        sku: 'SKU-C',
        product: {
          productID: 'product-c',
          name: 'Producto C',
        },
      } as StoreProduct['variation'],
    });
    manager.findOne.mockResolvedValue(spA);
    manager.find.mockResolvedValue([spA, spB, spC]);
    offerService.getApplicableOffers.mockResolvedValue([
      offer({
        offerID: 'bundle-offer',
        discountType: DiscountType.BUNDLE,
        bundleItems: [
          {
            productID: 'product-a',
            requiredQuantity: 1,
          } as SpecialOffer['bundleItems'][number],
          {
            productID: 'product-b',
            requiredQuantity: 1,
          } as SpecialOffer['bundleItems'][number],
        ],
      }),
    ]);
    offerService.getApplicableStoreProductIDs.mockResolvedValue(
      new Set(['sp-a', 'sp-b', 'sp-c']),
    );

    const result = await service.calculateCart({
      storeID: 'store-1',
      items: [
        { storeProductID: 'sp-a', quantity: 1 },
        { storeProductID: 'sp-b', quantity: 1 },
        { storeProductID: 'sp-c', quantity: 1 },
      ],
    });

    expect(result.totals.subtotal).toBe(3500);
    expect(result.totals.discount).toBe(500);
    expect(result.totals.total).toBe(3000);
    expect(result.items[2].lineTotal).toBe(0);
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
    priceHistoryRepository.createQueryBuilder.mockReturnValue(queryBuilder);

    const result = await service.getPriceHistoryList({
      storeID: 'store-1',
      variationID: 'variation-1',
    });

    expect(priceHistoryRepository.createQueryBuilder).toHaveBeenCalledWith(
      'history',
    );
    expect(result).toHaveLength(1);
    expect(result[0].storeProduct.variation.product.productID).toBe(
      'product-1',
    );
  });
});
