import { applyBundle, MutableCartLine } from './discount-engine';
import { DiscountType, SpecialOffer } from './entities/special-offer.entity';
import { StoreProduct } from '../relations/storeproduct/entities/storeproduct.entity';

function line(partial: Partial<MutableCartLine> = {}): MutableCartLine {
  return {
    storeProductID: partial.storeProductID ?? 'sp-1',
    storeID: partial.storeID ?? 'store-1',
    variationID: partial.variationID ?? 'variation-1',
    productID: partial.productID ?? 'product-1',
    productName: partial.productName ?? 'Producto 1',
    sku: partial.sku ?? 'SKU-1',
    quantity: partial.quantity ?? 1,
    baseUnitPrice: partial.baseUnitPrice ?? 1000,
    unitCost: partial.unitCost ?? 0,
    basePrice: partial.basePrice ?? 1000,
    currentTotal: partial.currentTotal ?? 1000,
    discountsApplied: partial.discountsApplied ?? [],
    breakdown: partial.breakdown ?? [],
    marginExempt: partial.marginExempt ?? false,
    storeProduct: partial.storeProduct ?? ({} as StoreProduct),
  };
}

function bundleOffer(
  items: Array<{ storeProductID: string; requiredQuantity?: number }>,
  allowBelowMargin = false,
): SpecialOffer {
  return {
    offerID: 'bundle-offer',
    tenantID: 'tenant-1',
    discountType: DiscountType.BUNDLE,
    allowBelowMargin,
    bundleItems: items.map((item, index) => ({
      specialOfferBundleItemID: `bi-${index}`,
      tenantID: 'tenant-1',
      offerID: 'bundle-offer',
      storeProductID: item.storeProductID,
      requiredQuantity: item.requiredQuantity ?? 1,
    })),
  } as SpecialOffer;
}

describe('applyBundle', () => {
  it('frees one unit per complete set with requiredQuantity > 1', () => {
    const spA = line({
      storeProductID: 'sp-a',
      quantity: 4,
      baseUnitPrice: 1000,
      basePrice: 4000,
      currentTotal: 4000,
    });
    const spB = line({
      storeProductID: 'sp-b',
      quantity: 3,
      baseUnitPrice: 2000,
      basePrice: 6000,
      currentTotal: 6000,
    });

    applyBundle(
      [spA, spB],
      bundleOffer([
        { storeProductID: 'sp-a', requiredQuantity: 2 },
        { storeProductID: 'sp-b', requiredQuantity: 1 },
      ]),
    );

    expect(spA.currentTotal).toBe(2000);
    expect(spB.currentTotal).toBe(6000);
    expect(spA.discountsApplied[0]).toMatchObject({
      offerID: 'bundle-offer',
      discountType: DiscountType.BUNDLE,
      resultingPrice: 2000,
      marginExempt: false,
    });
  });

  it('frees two units when two complete sets are present', () => {
    const spA = line({
      storeProductID: 'sp-a',
      quantity: 2,
      baseUnitPrice: 1000,
      basePrice: 2000,
      currentTotal: 2000,
    });
    const spB = line({
      storeProductID: 'sp-b',
      quantity: 2,
      baseUnitPrice: 2000,
      basePrice: 4000,
      currentTotal: 4000,
    });

    applyBundle(
      [spA, spB],
      bundleOffer([{ storeProductID: 'sp-a' }, { storeProductID: 'sp-b' }]),
    );

    expect(spA.currentTotal).toBe(0);
    expect(spB.currentTotal).toBe(4000);
    expect(spA.discountsApplied[0].details).toMatchObject({
      sets: 2,
      freeUnits: 2,
    });
  });

  it('leaves incomplete leftovers without discount', () => {
    const spA = line({
      storeProductID: 'sp-a',
      quantity: 3,
      baseUnitPrice: 1000,
      basePrice: 3000,
      currentTotal: 3000,
    });
    const spB = line({
      storeProductID: 'sp-b',
      quantity: 2,
      baseUnitPrice: 2000,
      basePrice: 4000,
      currentTotal: 4000,
    });

    applyBundle(
      [spA, spB],
      bundleOffer([
        { storeProductID: 'sp-a', requiredQuantity: 2 },
        { storeProductID: 'sp-b' },
      ]),
    );

    expect(spA.currentTotal).toBe(2000);
    expect(spB.currentTotal).toBe(4000);
  });

  it('takes the free unit from the cheapest bundle line, never from outside lines', () => {
    const spA = line({
      storeProductID: 'sp-a',
      quantity: 1,
      baseUnitPrice: 1000,
      basePrice: 1000,
      currentTotal: 1000,
    });
    const spB = line({
      storeProductID: 'sp-b',
      quantity: 1,
      baseUnitPrice: 2000,
      basePrice: 2000,
      currentTotal: 2000,
    });
    const spOutside = line({
      storeProductID: 'sp-outside',
      quantity: 1,
      baseUnitPrice: 500,
      basePrice: 500,
      currentTotal: 500,
    });

    applyBundle(
      [spA, spB],
      bundleOffer([{ storeProductID: 'sp-a' }, { storeProductID: 'sp-b' }]),
    );

    expect(spA.currentTotal).toBe(0);
    expect(spB.currentTotal).toBe(2000);
    expect(spOutside.currentTotal).toBe(500);
    expect(spOutside.discountsApplied).toHaveLength(0);
  });

  it('does nothing when bundle items are legacy without storeProductID', () => {
    const spA = line({
      storeProductID: 'sp-a',
      quantity: 1,
      baseUnitPrice: 1000,
      basePrice: 1000,
      currentTotal: 1000,
    });
    const spB = line({
      storeProductID: 'sp-b',
      quantity: 1,
      baseUnitPrice: 2000,
      basePrice: 2000,
      currentTotal: 2000,
    });

    applyBundle([spA, spB], {
      offerID: 'legacy-bundle',
      discountType: DiscountType.BUNDLE,
      bundleItems: [
        {
          productID: 'product-a',
          requiredQuantity: 1,
        },
        {
          productID: 'product-b',
          requiredQuantity: 1,
        },
      ],
    } as SpecialOffer);

    expect(spA.currentTotal).toBe(1000);
    expect(spB.currentTotal).toBe(2000);
  });

  it('marks the discounted line as marginExempt when allowBelowMargin is true', () => {
    const spA = line({
      storeProductID: 'sp-a',
      quantity: 1,
      baseUnitPrice: 1000,
      basePrice: 1000,
      currentTotal: 1000,
    });
    const spB = line({
      storeProductID: 'sp-b',
      quantity: 1,
      baseUnitPrice: 2000,
      basePrice: 2000,
      currentTotal: 2000,
    });

    applyBundle(
      [spA, spB],
      bundleOffer(
        [{ storeProductID: 'sp-a' }, { storeProductID: 'sp-b' }],
        true,
      ),
    );

    expect(spA.marginExempt).toBe(true);
    expect(spA.discountsApplied[0]).toMatchObject({
      marginExempt: true,
      offerID: 'bundle-offer',
    });
    expect(spB.marginExempt).toBe(false);
  });
});
