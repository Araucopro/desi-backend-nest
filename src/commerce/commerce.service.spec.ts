import { ForbiddenException } from '@nestjs/common';
import { CommerceService } from './commerce.service';

describe('CommerceService tenant/store binding', () => {
  const tenantID = '5323b94c-bea8-40fd-aac4-efdb6efcd75c';
  const storeID = 'ad191d2e-934b-4ec7-9792-c91a758d7336';

  it('rejects a store outside the channel tenant before reading inventory', async () => {
    const findOne = jest.fn().mockResolvedValue(null);
    const tenantContext = {
      getTenantId: jest.fn().mockReturnValue(tenantID),
      transaction: jest.fn(
        async (callback: (manager: unknown) => Promise<unknown>) =>
          callback({ getRepository: () => ({ findOne }) }),
      ),
    };
    const inventory = { getStoreInventory: jest.fn() };
    const commerce = new CommerceService(
      tenantContext as never,
      inventory as never,
      {} as never,
    );

    await expect(commerce.catalog(storeID)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(findOne).toHaveBeenCalledWith({
      where: { storeID, tenantID },
      select: ['storeID', 'tenantID', 'name'],
    });
    expect(inventory.getStoreInventory).not.toHaveBeenCalled();
  });
});

describe('CommerceService catalog content', () => {
  const storeID = 'ad191d2e-934b-4ec7-9792-c91a758d7336';
  const product = {
    productID: 'product-1',
    name: 'Boot',
    slug: 'boot',
    description: 'ERP description',
    image: 'https://res.cloudinary.com/demo/boot.jpg',
    category: null,
    variations: [
      {
        variationID: 'variation-1',
        sku: 'BOOT-38',
        variation: '38',
        storeProducts: [
          {
            storeProductID: 'sp-1',
            stock: 0,
            finalPrice: 5000,
            priceList: 5000,
          },
        ],
      },
    ],
  };
  function service(products: unknown[], rows: unknown[] = []) {
    const tenantContext = {
      getTenantId: () => 'tenant-1',
      transaction: async (callback: (manager: unknown) => Promise<unknown>) =>
        callback({
          getRepository: () => ({
            findOne: async () => ({ storeID, name: 'Test' }),
            find: async () => rows,
          }),
        }),
    };
    return new CommerceService(
      tenantContext as never,
      { getStoreInventory: async () => products } as never,
      {
        calculateCart: async () => ({
          items: [
            {
              storeProductID: 'sp-1',
              sku: 'BOOT-38',
              quantity: 1,
              finalUnitPrice: 5000,
              lineTotal: 5000,
            },
          ],
          totals: { total: 5000 },
        }),
      } as never,
    );
  }
  it('hides incomplete content and includes a sold-out product without category', async () => {
    const commerce = service([
      product,
      { ...product, image: '' },
      { ...product, description: ' ' },
      { ...product, slug: '' },
    ]);
    const catalog = await commerce.catalog(storeID);
    expect(catalog).toHaveLength(1);
    expect(catalog[0]).toMatchObject({
      productID: 'product-1',
      category: null,
      variants: [{ stock: 0, price: 5000 }],
    });
  });
  it('permits missing photos only for the channel with the requirement disabled', async () => {
    const commerce = service([
      { ...product, image: null },
      { ...product, image: null, description: ' ' },
      { ...product, image: null, slug: ' ' },
    ]);
    const optional = await commerce.catalog(storeID, false);
    expect(optional).toHaveLength(1);
    expect(optional[0].image).toBe('');
    // A different channel using the same store retains its own strict policy.
    expect(await commerce.catalog(storeID, true)).toEqual([]);
    expect(await commerce.catalog(storeID)).toEqual([]);
  });

  it('quotes a product without a photo when allowed, and rejects it after the requirement is restored', async () => {
    const commerce = service(
      [],
      [
        {
          storeProductID: 'sp-1',
          stock: 10,
          variation: {
            ...product.variations[0],
            product: { ...product, image: '' },
          },
        },
      ],
    );
    const dto = { items: [{ storeProductID: 'sp-1', quantity: 1 }] };
    const quote = await commerce.quote(storeID, dto, false);
    expect(quote.items[0]).toMatchObject({
      image: null,
      unitPrice: 5000,
      available: true,
    });
    await expect(commerce.quote(storeID, dto, true)).rejects.toThrow(
      'no longer available',
    );
  });

  it.each([{ slug: '' }, { description: ' ' }])(
    'still rejects incomplete web content with optional photos: %s',
    async (missing) => {
      const commerce = service(
        [],
        [
          {
            storeProductID: 'sp-1',
            stock: 10,
            variation: {
              ...product.variations[0],
              product: { ...product, image: '', ...missing },
            },
          },
        ],
      );
      await expect(
        commerce.quote(
          storeID,
          { items: [{ storeProductID: 'sp-1', quantity: 1 }] },
          false,
        ),
      ).rejects.toThrow('no longer available');
    },
  );

  it('quotes authoritative product metadata for the purchase receipt', async () => {
    const commerce = service(
      [],
      [
        {
          storeProductID: 'sp-1',
          stock: 10,
          variation: {
            ...product.variations[0],
            product,
            subVariation: 'Black',
          },
        },
      ],
    );
    const quote = await commerce.quote(storeID, {
      items: [{ storeProductID: 'sp-1', quantity: 1 }],
    });
    expect(quote.items[0]).toMatchObject({
      name: 'Boot',
      image: product.image,
      size: '38',
      color: 'Black',
      unitPrice: 5000,
    });
  });
  it('rejects an old cart item after its ERP photos are removed', async () => {
    const commerce = service(
      [],
      [
        {
          storeProductID: 'sp-1',
          stock: 10,
          variation: {
            ...product.variations[0],
            product: { ...product, image: '' },
          },
        },
      ],
    );
    await expect(
      commerce.quote(storeID, {
        items: [{ storeProductID: 'sp-1', quantity: 1 }],
      }),
    ).rejects.toThrow('no longer available');
  });
});
