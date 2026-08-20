import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OfferService } from './offer.service';
import {
  DiscountScope,
  DiscountType,
  OfferTargetScope,
  SpecialOffer,
  SpecialOfferBundleItem,
  SpecialOfferProduct,
} from './entities/special-offer.entity';
import { Category } from '../categories/entities/category.entity';
import { StoreProduct } from '../relations/storeproduct/entities/storeproduct.entity';
import { TenantContextService } from '../multitenant/tenant-context.service';

describe('OfferService', () => {
  let service: OfferService;
  let repository: jest.Mocked<Repository<SpecialOffer>>;
  let categoryRepository: jest.Mocked<Repository<Category>>;

  const mockRepository = {
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
    manager: {},
  };
  const mockProductRepository = {
    create: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  };
  const mockBundleRepository = {
    create: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  };
  const mockStoreProductRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
  };
  const mockCategoryRepository = {
    find: jest.fn(),
  };
  const mockTenantContext = {
    transaction: jest.fn(),
    getTenantId: jest.fn(),
  };
  const manager = {
    getRepository: jest.fn(),
    find: jest.fn(),
  };
  mockRepository.manager = manager as never;

  beforeEach(async () => {
    jest.clearAllMocks();
    manager.getRepository.mockImplementation((entity: unknown) => {
      if (entity === SpecialOffer) return mockRepository;
      if (entity === SpecialOfferProduct) return mockProductRepository;
      if (entity === SpecialOfferBundleItem) return mockBundleRepository;
      if (entity === StoreProduct) return mockStoreProductRepository;
      if (entity === Category) return mockCategoryRepository;
      return {};
    });
    manager.find.mockResolvedValue([]);
    mockProductRepository.create.mockImplementation((data: unknown) => data);
    mockBundleRepository.create.mockImplementation((data: unknown) => data);
    mockTenantContext.transaction.mockImplementation(
      (callback: (entityManager: unknown) => Promise<unknown>) =>
        callback(manager),
    );
    mockTenantContext.getTenantId.mockReturnValue('tenant-1');
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OfferService,
        {
          provide: TenantContextService,
          useValue: mockTenantContext,
        },
        {
          provide: getRepositoryToken(SpecialOffer),
          useValue: mockRepository,
        },
        {
          provide: getRepositoryToken(SpecialOfferProduct),
          useValue: mockProductRepository,
        },
        {
          provide: getRepositoryToken(SpecialOfferBundleItem),
          useValue: mockBundleRepository,
        },
        {
          provide: getRepositoryToken(Category),
          useValue: mockCategoryRepository,
        },
      ],
    }).compile();

    service = module.get<OfferService>(OfferService);
    repository = module.get(getRepositoryToken(SpecialOffer));
    categoryRepository = module.get(getRepositoryToken(Category));
  });

  function mockQueryBuilder(result: SpecialOffer[]) {
    const queryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      setParameters: jest.fn().mockReturnThis(),
      distinct: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(result),
    };
    repository.createQueryBuilder.mockReturnValue(queryBuilder as never);
    return queryBuilder;
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
    } as unknown as SpecialOffer;
  }

  it('returns the offer that produces the lowest final price', async () => {
    repository.find.mockResolvedValue([
      offer({
        offerID: 'offer-low',
        discountType: DiscountType.PERCENTAGE,
        value: 10,
      }),
      offer({
        offerID: 'offer-best',
        discountType: DiscountType.FIXED_PRICE,
        scope: DiscountScope.TOTAL,
        value: 70,
        exclusive: true,
      }),
    ]);

    const result = await service.getBestOffer('sp-1', 40, 2, new Date());

    expect(result?.offerID).toBe('offer-best');
    expect(result?.priority).toBeGreaterThan(0);
  });

  it('lists all special offers with product context', async () => {
    mockQueryBuilder([
      offer({
        offerID: 'offer-1',
        storeProduct: {
          storeProductID: 'sp-1',
          store: { storeID: 'store-1' },
          variation: {
            variationID: 'variation-1',
            product: { productID: 'product-1' },
          },
        } as SpecialOffer['storeProduct'],
      }),
    ]);

    const result = await service.getSpecialOffers();

    expect(repository.createQueryBuilder).toHaveBeenCalledWith('offer');
    expect(result).toHaveLength(1);
    expect(result[0].storeProduct?.store?.storeID).toBe('store-1');
  });

  it('matches offers by store, product, category with subcategories, brand and model', async () => {
    mockQueryBuilder([
      offer({
        offerID: 'store-offer',
        targetScope: OfferTargetScope.STORE,
        storeID: 'store-1',
        priority: 2,
      }),
      offer({
        offerID: 'product-offer',
        targetScope: OfferTargetScope.PRODUCT,
        storeID: 'store-1',
        priority: 1,
        productTargets: [{ productID: 'product-1' } as SpecialOfferProduct],
      }),
      offer({
        offerID: 'category-offer',
        targetScope: OfferTargetScope.CATEGORY,
        storeID: 'store-1',
        categoryID: 'category-root',
        includeSubcategories: true,
        priority: 3,
      }),
      offer({
        offerID: 'brand-offer',
        targetScope: OfferTargetScope.BRAND,
        storeID: 'store-1',
        brand: 'MarcaX',
        priority: 4,
      }),
      offer({
        offerID: 'model-offer',
        targetScope: OfferTargetScope.MODEL,
        storeID: 'store-1',
        model: 'Producto A',
        priority: 5,
      }),
      offer({
        offerID: 'other-store-offer',
        targetScope: OfferTargetScope.STORE,
        storeID: 'store-2',
      }),
    ]);
    categoryRepository.find.mockResolvedValue([
      {
        categoryID: 'category-child',
        parentID: 'category-root',
        tenantID: 'tenant-1',
        name: 'Hija',
      } as Category,
    ]);

    const result = await service.getApplicableOffers(
      {
        storeID: 'store-1',
        pricingDate: new Date('2026-06-01T00:00:00.000Z'),
        items: [
          {
            storeProductID: 'sp-1',
            storeID: 'store-1',
            productID: 'product-1',
            variationID: 'variation-1',
            categoryID: 'category-child',
            brand: 'MarcaX',
            model: 'Producto A',
            quantity: 2,
            unitPrice: 1000,
          },
        ],
      },
      new Date('2026-06-01T00:00:00.000Z'),
    );

    expect(result.map((item) => item.offerID)).toEqual([
      'product-offer',
      'store-offer',
      'category-offer',
      'brand-offer',
      'model-offer',
    ]);
  });

  it('rejects BUY_X_GET_Y with invalid buy/pay quantities', async () => {
    await expect(
      service.createSpecialOffer({
        storeProductID: 'sp-1',
        discountType: DiscountType.BUY_X_GET_Y,
        value: 0,
        startDate: '2026-01-01T00:00:00Z',
        buyQuantity: 2,
        payQuantity: 2,
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects BUNDLE with less than two bundle items', async () => {
    await expect(
      service.createSpecialOffer({
        storeProductID: 'sp-1',
        discountType: DiscountType.BUNDLE,
        value: 0,
        startDate: '2026-01-01T00:00:00Z',
        bundleItems: [{ productID: 'product-1' }],
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('persists BUNDLE items with storeProductID and derived productID on create', async () => {
    const storeProductA = {
      storeProductID: 'sp-a',
      tenantID: 'tenant-1',
      variation: {
        variationID: 'variation-a',
        product: { productID: 'product-a', name: 'Producto A' },
      },
    } as unknown as StoreProduct;
    const storeProductB = {
      storeProductID: 'sp-b',
      tenantID: 'tenant-1',
      variation: {
        variationID: 'variation-b',
        product: { productID: 'product-b', name: 'Producto B' },
      },
    } as unknown as StoreProduct;
    manager.find.mockResolvedValue([storeProductA, storeProductB]);
    mockRepository.create.mockImplementation(
      (data: Record<string, unknown>) => ({
        offerID: 'offer-new',
        tenantID: 'tenant-1',
        ...data,
      }),
    );
    mockRepository.save.mockResolvedValue({
      offerID: 'offer-new',
      tenantID: 'tenant-1',
    });
    mockRepository.findOne.mockResolvedValue({
      offerID: 'offer-new',
      tenantID: 'tenant-1',
      discountType: DiscountType.BUNDLE,
      bundleItems: [
        {
          specialOfferBundleItemID: 'bi-1',
          storeProductID: 'sp-a',
          productID: 'product-a',
          requiredQuantity: 2,
          storeProduct: storeProductA,
        },
        {
          specialOfferBundleItemID: 'bi-2',
          storeProductID: 'sp-b',
          productID: 'product-b',
          requiredQuantity: 1,
          storeProduct: storeProductB,
        },
      ],
    } as SpecialOffer);

    await service.createSpecialOffer({
      discountType: DiscountType.BUNDLE,
      value: 0,
      storeID: 'store-1',
      startDate: '2026-01-01T00:00:00Z',
      allowBelowMargin: true,
      bundleItems: [
        { storeProductID: 'sp-a', requiredQuantity: 2 },
        { storeProductID: 'sp-b', requiredQuantity: 1 },
      ],
    } as never);

    expect(manager.find).toHaveBeenCalledWith(
      StoreProduct,
      expect.objectContaining({
        where: {
          store: { storeID: 'store-1' },
          storeProductID: expect.anything(),
        },
      }),
    );
    expect(mockRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        allowBelowMargin: true,
        storeID: 'store-1',
        tenantID: 'tenant-1',
      }),
    );
    expect(mockBundleRepository.save).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          tenantID: 'tenant-1',
          storeProductID: 'sp-a',
          productID: 'product-a',
          requiredQuantity: 2,
        }),
        expect.objectContaining({
          tenantID: 'tenant-1',
          storeProductID: 'sp-b',
          productID: 'product-b',
          requiredQuantity: 1,
        }),
      ]),
    );
  });

  it('propagates tenantID to offer and product targets on create', async () => {
    mockRepository.create.mockImplementation(
      (data: Record<string, unknown>) => ({
        offerID: 'offer-new',
        tenantID: data.tenantID,
        ...data,
      }),
    );
    mockRepository.save.mockResolvedValue({
      offerID: 'offer-new',
      tenantID: 'tenant-1',
    });
    mockRepository.findOne.mockResolvedValue({
      offerID: 'offer-new',
      tenantID: 'tenant-1',
      productTargets: [],
      bundleItems: [],
    } as unknown as SpecialOffer);

    await service.createSpecialOffer({
      targetScope: OfferTargetScope.PRODUCT,
      storeID: 'store-1',
      productIDs: ['product-1'],
      discountType: DiscountType.PERCENTAGE,
      value: 10,
      startDate: '2026-01-01T00:00:00Z',
    } as never);

    expect(mockRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ tenantID: 'tenant-1' }),
    );
    expect(mockProductRepository.save).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          tenantID: 'tenant-1',
          productID: 'product-1',
        }),
      ]),
    );
  });

  it('rejects BUNDLE items that belong to another store', async () => {
    manager.find.mockResolvedValue([
      {
        storeProductID: 'sp-a',
        tenantID: 'tenant-1',
        variation: {
          product: { productID: 'product-a' },
        },
      } as unknown as StoreProduct,
    ]);

    await expect(
      service.createSpecialOffer({
        discountType: DiscountType.BUNDLE,
        value: 0,
        storeID: 'store-1',
        startDate: '2026-01-01T00:00:00Z',
        bundleItems: [
          { storeProductID: 'sp-a' },
          { storeProductID: 'sp-other-store' },
        ],
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('updates BUNDLE items with storeProductID and derived productID', async () => {
    const existing = {
      offerID: 'offer-1',
      tenantID: 'tenant-1',
      targetScope: OfferTargetScope.STORE,
      storeProductID: null,
      storeID: 'store-1',
      includeSubcategories: true,
      priority: 0,
      discountType: DiscountType.BUNDLE,
      value: 0,
      exclusive: false,
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      isActive: true,
      bundleItems: [],
      productTargets: [],
    } as unknown as SpecialOffer;
    const storeProductA = {
      storeProductID: 'sp-a',
      tenantID: 'tenant-1',
      variation: {
        variationID: 'variation-a',
        product: { productID: 'product-a', name: 'Producto A' },
      },
    } as unknown as StoreProduct;
    const storeProductB = {
      storeProductID: 'sp-b',
      tenantID: 'tenant-1',
      variation: {
        variationID: 'variation-b',
        product: { productID: 'product-b', name: 'Producto B' },
      },
    } as unknown as StoreProduct;
    manager.find.mockResolvedValue([storeProductA, storeProductB]);
    mockRepository.findOne
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce({
        ...existing,
        allowBelowMargin: true,
        bundleItems: [
          {
            specialOfferBundleItemID: 'bi-1',
            storeProductID: 'sp-a',
            productID: 'product-a',
            requiredQuantity: 2,
            storeProduct: storeProductA,
          },
          {
            specialOfferBundleItemID: 'bi-2',
            storeProductID: 'sp-b',
            productID: 'product-b',
            requiredQuantity: 1,
            storeProduct: storeProductB,
          },
        ],
      } as SpecialOffer);

    await service.updateSpecialOffer('offer-1', {
      allowBelowMargin: true,
      bundleItems: [
        { storeProductID: 'sp-a', requiredQuantity: 2 },
        { storeProductID: 'sp-b', requiredQuantity: 1 },
      ],
    } as never);

    expect(mockBundleRepository.delete).toHaveBeenCalledWith({
      offerID: 'offer-1',
    });
    expect(mockBundleRepository.save).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          tenantID: 'tenant-1',
          storeProductID: 'sp-a',
          productID: 'product-a',
          requiredQuantity: 2,
        }),
      ]),
    );
    expect(mockRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ allowBelowMargin: true }),
    );
  });

  it('allows updating other fields of a legacy BUNDLE without rewriting items', async () => {
    const existing = {
      offerID: 'offer-legacy',
      tenantID: 'tenant-1',
      targetScope: OfferTargetScope.STORE,
      storeProductID: null,
      storeID: 'store-1',
      includeSubcategories: true,
      priority: 0,
      discountType: DiscountType.BUNDLE,
      value: 0,
      exclusive: false,
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      isActive: false,
      bundleItems: [
        {
          specialOfferBundleItemID: 'bi-1',
          storeProductID: null,
          productID: 'product-a',
          requiredQuantity: 1,
        },
        {
          specialOfferBundleItemID: 'bi-2',
          storeProductID: null,
          productID: 'product-b',
          requiredQuantity: 1,
        },
      ] as SpecialOffer['bundleItems'],
      productTargets: [],
    } as unknown as SpecialOffer;
    mockRepository.findOne
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce(existing);

    await service.updateSpecialOffer('offer-legacy', {
      isActive: true,
    } as never);

    expect(mockBundleRepository.delete).not.toHaveBeenCalled();
    expect(mockRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: true }),
    );
  });

  it('matches BUNDLE offers only when a cart line belongs to the bundle in the offer store', async () => {
    mockQueryBuilder([
      offer({
        offerID: 'bundle-offer',
        discountType: DiscountType.BUNDLE,
        storeID: 'store-1',
        bundleItems: [
          {
            specialOfferBundleItemID: 'bi-1',
            storeProductID: 'sp-a',
            requiredQuantity: 1,
          },
          {
            specialOfferBundleItemID: 'bi-2',
            storeProductID: 'sp-b',
            requiredQuantity: 1,
          },
        ] as SpecialOffer['bundleItems'],
      }),
      offer({
        offerID: 'other-store-bundle',
        discountType: DiscountType.BUNDLE,
        storeID: 'store-2',
        bundleItems: [
          {
            specialOfferBundleItemID: 'bi-3',
            storeProductID: 'sp-a',
            requiredQuantity: 1,
          },
          {
            specialOfferBundleItemID: 'bi-4',
            storeProductID: 'sp-b',
            requiredQuantity: 1,
          },
        ] as SpecialOffer['bundleItems'],
      }),
    ]);

    const result = await service.getApplicableOffers({
      storeID: 'store-1',
      pricingDate: new Date('2026-06-01T00:00:00.000Z'),
      items: [
        {
          storeProductID: 'sp-a',
          storeID: 'store-1',
          productID: 'product-a',
          variationID: 'variation-a',
          quantity: 1,
          unitPrice: 1000,
        },
      ],
    });

    expect(result.map((item) => item.offerID)).toEqual(['bundle-offer']);
  });

  it('does not match BUNDLE offers when the cart has no bundle line', async () => {
    mockQueryBuilder([
      offer({
        offerID: 'bundle-offer',
        discountType: DiscountType.BUNDLE,
        storeID: 'store-1',
        bundleItems: [
          {
            specialOfferBundleItemID: 'bi-1',
            storeProductID: 'sp-a',
            requiredQuantity: 1,
          },
          {
            specialOfferBundleItemID: 'bi-2',
            storeProductID: 'sp-b',
            requiredQuantity: 1,
          },
        ] as SpecialOffer['bundleItems'],
      }),
    ]);

    const result = await service.getApplicableOffers({
      storeID: 'store-1',
      pricingDate: new Date('2026-06-01T00:00:00.000Z'),
      items: [
        {
          storeProductID: 'sp-c',
          storeID: 'store-1',
          productID: 'product-c',
          variationID: 'variation-c',
          quantity: 1,
          unitPrice: 1000,
        },
      ],
    });

    expect(result).toHaveLength(0);
  });

  it('ignores legacy BUNDLE items without storeProductID for applicability', async () => {
    mockQueryBuilder([
      offer({
        offerID: 'legacy-bundle',
        discountType: DiscountType.BUNDLE,
        storeID: 'store-1',
        bundleItems: [
          {
            specialOfferBundleItemID: 'bi-1',
            storeProductID: null,
            productID: 'product-a',
            requiredQuantity: 1,
          },
          {
            specialOfferBundleItemID: 'bi-2',
            storeProductID: null,
            productID: 'product-b',
            requiredQuantity: 1,
          },
        ] as SpecialOffer['bundleItems'],
      }),
    ]);

    const result = await service.getApplicableOffers({
      storeID: 'store-1',
      pricingDate: new Date('2026-06-01T00:00:00.000Z'),
      items: [
        {
          storeProductID: 'sp-a',
          storeID: 'store-1',
          productID: 'product-a',
          variationID: 'variation-a',
          quantity: 1,
          unitPrice: 1000,
        },
      ],
    });

    expect(result).toHaveLength(0);
  });

  it('returns only bundle lines as applicable store products for BUNDLE', async () => {
    const bundle = offer({
      offerID: 'bundle-offer',
      discountType: DiscountType.BUNDLE,
      storeID: 'store-1',
      bundleItems: [
        {
          specialOfferBundleItemID: 'bi-1',
          storeProductID: 'sp-a',
          requiredQuantity: 1,
        },
        {
          specialOfferBundleItemID: 'bi-2',
          storeProductID: 'sp-b',
          requiredQuantity: 1,
        },
      ] as SpecialOffer['bundleItems'],
    });

    const result = await service.getApplicableStoreProductIDs(bundle, {
      storeID: 'store-1',
      pricingDate: new Date('2026-06-01T00:00:00.000Z'),
      items: [
        {
          storeProductID: 'sp-a',
          storeID: 'store-1',
          productID: 'product-a',
          variationID: 'variation-a',
          quantity: 1,
          unitPrice: 1000,
        },
        {
          storeProductID: 'sp-c',
          storeID: 'store-1',
          productID: 'product-c',
          variationID: 'variation-c',
          quantity: 1,
          unitPrice: 1000,
        },
      ],
    });

    expect(result).toEqual(new Set(['sp-a']));
  });

  it('lists bundle items with product, variation and store context', async () => {
    mockQueryBuilder([
      offer({
        offerID: 'bundle-offer',
        discountType: DiscountType.BUNDLE,
        storeID: 'store-1',
        bundleItems: [
          {
            specialOfferBundleItemID: 'bi-1',
            storeProductID: 'sp-a',
            requiredQuantity: 1,
            storeProduct: {
              storeProductID: 'sp-a',
              store: { storeID: 'store-1' },
              variation: {
                variationID: 'variation-a',
                product: { productID: 'product-a', name: 'Producto A' },
              },
            },
          },
        ] as SpecialOffer['bundleItems'],
      }),
    ]);

    const result = await service.getSpecialOffers();

    expect(result[0].bundleItems[0].storeProduct?.store?.storeID).toBe(
      'store-1',
    );
    expect(
      result[0].bundleItems[0].storeProduct?.variation?.product?.productID,
    ).toBe('product-a');
  });
});
