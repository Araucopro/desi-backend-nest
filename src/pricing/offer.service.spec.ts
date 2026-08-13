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
  const mockCategoryRepository = {
    find: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OfferService,
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
    } as SpecialOffer;
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
        productTargets: [
          { productID: 'product-1' } as SpecialOfferProduct,
        ],
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
});
