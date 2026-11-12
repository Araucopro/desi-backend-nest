import { UpdateSpecialOfferDto } from './dto/update-special-offer.dto';
import { TenantContextInterceptor } from '../multitenant/tenant-context.interceptor';
import { Reflector } from '@nestjs/core';
import { of } from 'rxjs';
import {
  BadRequestException,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { PricingService } from './pricing.service';
import { OfferService } from './offer.service';
import { TenantOfferAdminGuard } from './tenant-offer-admin.guard';
import { TenantContextService } from '../multitenant/tenant-context.service';
import { StoreProduct } from '../relations/storeproduct/entities/storeproduct.entity';
import { Category } from '../categories/entities/category.entity';
import { Store } from '../stores/entities/store.entity';
import { CommerceChannel } from '../commerce/entities/commerce-channel.entity';
import { Product } from '../products/entities/product.entity';
import { PriceHistory } from './entities/price-history.entity';
import { MarginValidator } from './validators/margin.validator';
import { UserDiscountValidator } from './validators/user-discount.validator';
import { CreateSpecialOfferDto } from './dto/create-special-offer.dto';
import {
  DiscountType,
  OfferSalesChannel,
  OfferTargetScope,
  SpecialOffer,
  SpecialOfferBundleItem,
  SpecialOfferProduct,
} from './entities/special-offer.entity';

function scenario(
  targetScope: OfferTargetScope,
  channel = OfferSalesChannel.PHYSICAL,
  storeID = 'store-1',
) {
  const offer = {
    offerID: 'promo-1',
    tenantID: 'tenant-1',
    targetScope,
    storeID: 'store-1',
    storeIDs: ['store-1', 'branch-2'],
    salesChannels: [OfferSalesChannel.PHYSICAL],
    categoryID: 'category-1',
    includeSubcategories: true,
    brand: 'Marca A',
    productTargets: [{ productID: 'p1' }, { productID: 'p2' }],
    discountType: DiscountType.BUY_X_GET_Y,
    value: 0,
    buyQuantity: 2,
    payQuantity: 1,
    allowBelowMargin: true,
    priority: 0,
    startDate: new Date('2026-01-01'),
  } as SpecialOffer;
  const storeProducts = [1000, 2000, 500].map(
    (priceList, index) =>
      ({
        tenantID: 'tenant-1',
        storeProductID: 'sp' + (index + 1),
        priceList,
        priceCost: 100,
        stock: 10,
        store: { storeID },
        variation: {
          variationID: 'v' + index,
          sku: 'SKU' + index,
          product: {
            productID: 'p' + (index + 1),
            name: 'Producto ' + index,
            brand: index < 2 ? 'Marca A' : 'Otra marca',
            category: { categoryID: index < 2 ? 'category-1' : 'other' },
          },
        },
      }) as StoreProduct,
  );
  const builder = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    setParameters: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn(async () => [offer]),
  };
  const repository = {
    createQueryBuilder: () => builder,
    create: jest.fn((data) => data),
    save: jest.fn(async (data) => data),
    findOne: jest.fn(async () => offer),
  };
  const storeRepository = {
    count: jest.fn(async () => 2),
    find: jest.fn(async () => [
      { storeID: 'store-1', name: 'Central' },
      { storeID: 'branch-2', name: 'Sucursal' },
    ]),
  };
  const categoryRepository = {
    find: jest.fn(async () => []),
    count: jest.fn(async () => 1),
  };
  const productRepository = { count: jest.fn(async () => 2) };
  const channelRepository = {
    count: jest.fn(async () => 1),
    find: jest.fn(async () => [{ storeID: 'branch-2' }]),
  };
  const childrenRepository = {
    create: jest.fn((data) => data),
    save: jest.fn(async (data) => data),
    delete: jest.fn(),
  };
  const manager = {
    getRepository: jest.fn((entity) => {
      if (entity === SpecialOffer) return repository;
      if (entity === Store) return storeRepository;
      if (entity === Product) return productRepository;
      if (entity === Category) return categoryRepository;
      if (entity === CommerceChannel) return channelRepository;
      if (entity === SpecialOfferProduct || entity === SpecialOfferBundleItem)
        return childrenRepository;
      return {};
    }),
    find: jest.fn(async (entity, options) =>
      entity === StoreProduct
        ? storeProducts.filter((item) =>
            options.where.storeProductID.value.includes(item.storeProductID),
          )
        : [],
    ),
  };
  const context = {
    get: jest.fn(() => ({ tenantId: 'tenant-1', salesChannel: channel })),
    getTenantId: () => 'tenant-1',
    transaction: jest.fn((callback) => callback(manager)),
  };
  const source = {
    transaction: jest.fn((callback) => callback(manager)),
    manager,
  } as unknown as DataSource;
  const offers = new OfferService(
    repository as unknown as Repository<SpecialOffer>,
    childrenRepository as unknown as Repository<SpecialOfferProduct>,
    childrenRepository as unknown as Repository<SpecialOfferBundleItem>,
    categoryRepository as unknown as Repository<Category>,
    context as unknown as TenantContextService,
  );
  const pricing = new PricingService(
    {} as Repository<PriceHistory>,
    source,
    offers,
    new MarginValidator(),
    new UserDiscountValidator(source),
    context as unknown as TenantContextService,
  );
  const input = {
    storeID,
    items: [
      { storeProductID: 'sp1', quantity: 1 },
      { storeProductID: 'sp2', quantity: 1 },
      { storeProductID: 'sp3', quantity: 1 },
    ],
  };
  return {
    offer,
    pricing,
    offers,
    input,
    manager,
    context,
    repository,
    storeRepository,
    productRepository,
    channelRepository,
  };
}

describe('discount coverage with the real offer and pricing services', () => {
  it.each([
    OfferTargetScope.CATEGORY,
    OfferTargetScope.BRAND,
    OfferTargetScope.PRODUCT,
  ])(
    'charges the expensive eligible product and keeps the outsider at full price for %s',
    async (target) => {
      const { pricing, input } = scenario(target);
      const result = await pricing.calculateCart(input);
      expect(result.totals.total).toBe(2500);
      expect(result.items.map((item) => item.lineTotal)).toEqual([
        0, 2000, 500,
      ]);
    },
  );
  it('does not grant a free unit until a complete pair exists', async () => {
    const { pricing, input } = scenario(OfferTargetScope.BRAND);
    input.items = input.items.filter((item) => item.storeProductID !== 'sp2');
    expect((await pricing.calculateCart(input)).totals.total).toBe(1500);
  });
  it('recalculates the number of free units when quantities change', async () => {
    const { pricing, input } = scenario(OfferTargetScope.BRAND);
    input.items[0].quantity = 2;
    input.items[1].quantity = 2;
    expect((await pricing.calculateCart(input)).totals.total).toBe(4500);
  });
  it('applies in a selected second branch', async () => {
    const { pricing, input } = scenario(
      OfferTargetScope.BRAND,
      OfferSalesChannel.PHYSICAL,
      'branch-2',
    );
    expect((await pricing.calculateCart(input)).totals.total).toBe(2500);
  });
  it('does not apply in an unselected branch', async () => {
    const { pricing, input } = scenario(
      OfferTargetScope.BRAND,
      OfferSalesChannel.PHYSICAL,
      'other-store',
    );
    expect((await pricing.calculateCart(input)).totals.total).toBe(3500);
  });
  it('isolates physical offers from ecommerce and vice versa', async () => {
    const { pricing, input, offer } = scenario(
      OfferTargetScope.BRAND,
      OfferSalesChannel.ONLINE,
    );
    expect((await pricing.calculateCart(input)).totals.total).toBe(3500);
    offer.salesChannels = [OfferSalesChannel.ONLINE];
    expect((await pricing.calculateCart(input)).totals.total).toBe(2500);
    const physical = scenario(OfferTargetScope.BRAND);
    physical.offer.salesChannels = [OfferSalesChannel.ONLINE];
    expect(
      (await physical.pricing.calculateCart(physical.input)).totals.total,
    ).toBe(3500);
  });
  it('uses the same channel restrictions in catalog prices', async () => {
    const { offers, input, manager } = scenario(
      OfferTargetScope.BRAND,
      OfferSalesChannel.ONLINE,
    );
    const items = input.items.map((item, index) => ({
      ...item,
      storeID: 'store-1',
      productID: 'p' + (index + 1),
      variationID: 'v' + index,
      brand: 'Marca A',
      unitPrice: 1000,
    }));
    const results = await offers.getApplicableOffersForItems(
      manager as unknown as EntityManager,
      [
        {
          storeID: 'store-1',
          pricingDate: new Date(),
          salesChannel: OfferSalesChannel.ONLINE,
          items,
        },
      ],
    );
    expect([...results.values()].every((offers) => offers.length === 0)).toBe(
      true,
    );
  });
  it('rejects branches outside the current tenant before saving', async () => {
    const test = scenario(OfferTargetScope.BRAND);
    test.storeRepository.count.mockResolvedValue(1);
    await expect(
      test.offers.createSpecialOffer({
        discountType: DiscountType.PERCENTAGE,
        value: 10,
        startDate: '2026-01-01',
        targetScope: OfferTargetScope.BRAND,
        brand: 'Marca A',
        storeID: 'store-1',
        storeIDs: ['store-1', 'foreign-store'],
        salesChannels: [OfferSalesChannel.PHYSICAL],
      }),
    ).rejects.toThrow(BadRequestException);
    expect(test.storeRepository.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantID: 'tenant-1' }),
      }),
    );
    expect(test.repository.save).not.toHaveBeenCalled();
  });
  it('rejects products from another tenant', async () => {
    const test = scenario(OfferTargetScope.PRODUCT);
    test.productRepository.count.mockResolvedValue(1);
    await expect(
      test.offers.createSpecialOffer({
        discountType: DiscountType.BUY_X_GET_Y,
        buyQuantity: 2,
        payQuantity: 1,
        value: 0,
        startDate: '2026-01-01',
        targetScope: OfferTargetScope.PRODUCT,
        productIDs: ['p1', 'foreign'],
        storeID: 'store-1',
        storeIDs: ['store-1', 'branch-2'],
        salesChannels: [OfferSalesChannel.PHYSICAL],
      }),
    ).rejects.toThrow('pertenecer a tu empresa');
    expect(test.repository.save).not.toHaveBeenCalled();
  });
  it('rejects an online scope without an active tenant ecommerce', async () => {
    const test = scenario(OfferTargetScope.BRAND);
    test.channelRepository.count.mockResolvedValue(0);
    await expect(
      test.offers.createSpecialOffer({
        discountType: DiscountType.PERCENTAGE,
        value: 10,
        startDate: '2026-01-01',
        targetScope: OfferTargetScope.BRAND,
        brand: 'Marca A',
        storeID: 'store-1',
        storeIDs: ['store-1', 'branch-2'],
        salesChannels: [OfferSalesChannel.ONLINE],
      }),
    ).rejects.toThrow('ecommerce activo');
  });
  it('saves both channels and the selected branches', async () => {
    const test = scenario(OfferTargetScope.BRAND);
    await test.offers.createSpecialOffer({
      discountType: DiscountType.PERCENTAGE,
      value: 10,
      startDate: '2026-01-01',
      targetScope: OfferTargetScope.BRAND,
      brand: 'Marca A',
      storeID: 'store-1',
      storeIDs: ['store-1', 'branch-2'],
      salesChannels: [OfferSalesChannel.PHYSICAL, OfferSalesChannel.ONLINE],
    });
    expect(test.repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantID: 'tenant-1',
        storeIDs: ['store-1', 'branch-2'],
        salesChannels: ['PHYSICAL', 'ONLINE'],
      }),
    );
  });
});

describe('discount management permissions', () => {
  const guard = new TenantOfferAdminGuard();
  const context = (user: unknown) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as ExecutionContext;
  it('allows the tenant administrator', () =>
    expect(
      guard.canActivate(
        context({ type: 'tenant', role: 'admin', tenantId: 'tenant-1' }),
      ),
    ).toBe(true));
  it('allows master only during active impersonation', () =>
    expect(
      guard.canActivate(
        context({ type: 'master', impersonatingTenantId: 'tenant-1' }),
      ),
    ).toBe(true));
  it.each([
    undefined,
    { type: 'master' },
    { type: 'channel', tenantId: 'tenant-1' },
    { type: 'tenant', role: 'store_manager', tenantId: 'tenant-1' },
    { type: 'tenant', role: 'admin' },
  ])('rejects an unauthorized session %j', (user) =>
    expect(() => guard.canActivate(context(user))).toThrow(ForbiddenException),
  );
});

describe('coverage DTO validation', () => {
  const base = {
    discountType: 'PERCENTAGE',
    value: 10,
    startDate: '2026-01-01',
    salesChannels: ['PHYSICAL'],
    storeIDs: ['00000000-0000-4000-8000-000000000001'],
  };
  it('accepts a valid channel and branch', () =>
    expect(
      validateSync(plainToInstance(CreateSpecialOfferDto, base)),
    ).toHaveLength(0));
  it.each([
    { salesChannels: null },
    { storeIDs: null },
    { salesChannels: [] },
    { salesChannels: ['MASTER'] },
    { salesChannels: ['ONLINE', 'ONLINE'] },
    { storeIDs: [] },
    { storeIDs: ['not-a-uuid'] },
  ])('rejects malformed coverage %j', (overrides) =>
    expect(
      validateSync(
        plainToInstance(CreateSpecialOfferDto, { ...base, ...overrides }),
      ).length,
    ).toBeGreaterThan(0),
  );
});

describe('partial coverage updates', () => {
  it('allows a status-only update', () =>
    expect(
      validateSync(plainToInstance(UpdateSpecialOfferDto, { isActive: false })),
    ).toHaveLength(0));
  it.each([
    { storeIDs: null },
    { salesChannels: null },
    { storeIDs: [] },
    { salesChannels: [] },
  ])('rejects malformed partial coverage %j', (payload) =>
    expect(
      validateSync(plainToInstance(UpdateSpecialOfferDto, payload)).length,
    ).toBeGreaterThan(0),
  );
});

describe('trusted pricing channel context', () => {
  it.each([
    ['channel', 'ONLINE'],
    ['tenant', 'PHYSICAL'],
    ['master', 'PHYSICAL'],
  ])('derives %s session pricing from authentication', (type, expected) => {
    const run = jest.fn((_context, callback) => callback());
    const service = { run } as unknown as TenantContextService;
    const reflector = {
      getAllAndOverride: () => false,
    } as unknown as Reflector;
    const interceptor = new TenantContextInterceptor(service, reflector);
    const context = {
      getHandler: () => null,
      getClass: () => null,
      switchToHttp: () => ({
        getRequest: () => ({
          user: {
            type,
            tenantId: 'tenant-1',
            ...(type === 'master' ? { impersonatingTenantId: 'tenant-1' } : {}),
          },
          body: { salesChannel: 'ONLINE' },
        }),
      }),
    } as unknown as ExecutionContext;
    interceptor.intercept(context, { handle: () => of(null) });
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({ salesChannel: expected, tenantId: 'tenant-1' }),
      expect.any(Function),
    );
  });
});
