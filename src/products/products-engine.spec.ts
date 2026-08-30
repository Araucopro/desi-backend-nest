import { buildVariationPlan } from './products-engine';
import { ProductVariation } from './entities/product-variation.entity';

function variation(sku: string, variationID = `var-${sku}`): ProductVariation {
  return { sku, variationID } as ProductVariation;
}

describe('products-engine', () => {
  it('plans creates for new variations in input order', () => {
    const plan = buildVariationPlan({
      variations: [
        { sku: 'SKU-A', priceCost: 100 } as any,
        { sku: 'SKU-B', priceCost: 200 } as any,
      ],
      existing: [],
    });

    expect(plan).toEqual([
      { kind: 'create', dto: { sku: 'SKU-A', priceCost: 100 } },
      { kind: 'create', dto: { sku: 'SKU-B', priceCost: 200 } },
    ]);
  });

  it('plans updates for matching SKUs and removes obsolete variations', () => {
    const plan = buildVariationPlan({
      variations: [{ sku: 'SKU-B', priceList: 500 } as any],
      existing: [
        variation('SKU-A', 'var-a'),
        variation('SKU-B', 'var-b'),
        variation('SKU-C', 'var-c'),
      ],
    });

    expect(plan).toEqual([
      {
        kind: 'update',
        dto: { sku: 'SKU-B', priceList: 500 },
        variation: variation('SKU-B', 'var-b'),
      },
      { kind: 'remove', variation: variation('SKU-A', 'var-a') },
      { kind: 'remove', variation: variation('SKU-C', 'var-c') },
    ]);
  });

  it('treats a repeated SKU after the first match as a new variation', () => {
    const plan = buildVariationPlan({
      variations: [
        { sku: 'SKU-A', priceCost: 1 } as any,
        { sku: 'SKU-A', priceCost: 2 } as any,
      ],
      existing: [variation('SKU-A')],
    });

    expect(plan).toEqual([
      {
        kind: 'update',
        dto: { sku: 'SKU-A', priceCost: 1 },
        variation: variation('SKU-A'),
      },
      { kind: 'create', dto: { sku: 'SKU-A', priceCost: 2 } },
    ]);
  });
});
