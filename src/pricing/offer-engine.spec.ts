import { BadRequestException } from '@nestjs/common';
import { DiscountType, SpecialOffer } from './entities/special-offer.entity';
import { simulateOfferPrice, validateOfferConfiguration } from './offer-engine';
import { OfferValidationInput } from './offer.types';

function bundleConfig(
  partial: Partial<OfferValidationInput> = {},
): OfferValidationInput {
  return {
    discountType: DiscountType.BUNDLE,
    storeID: 'store-1',
    bundleItems: [
      { storeProductID: 'sp-a', requiredQuantity: 1 },
      { storeProductID: 'sp-b', requiredQuantity: 1 },
    ],
    ...partial,
  };
}

describe('validateOfferConfiguration (BUNDLE)', () => {
  it('accepts a valid bundle with distinct storeProducts', () => {
    expect(() => validateOfferConfiguration(bundleConfig())).not.toThrow();
  });

  it('rejects a bundle with fewer than two items', () => {
    expect(() =>
      validateOfferConfiguration(
        bundleConfig({ bundleItems: [{ storeProductID: 'sp-a' }] }),
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects duplicate storeProductIDs', () => {
    expect(() =>
      validateOfferConfiguration(
        bundleConfig({
          bundleItems: [{ storeProductID: 'sp-a' }, { storeProductID: 'sp-a' }],
        }),
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects a bundle without storeID', () => {
    expect(() =>
      validateOfferConfiguration(bundleConfig({ storeID: null })),
    ).toThrow(BadRequestException);
  });

  it('rejects items with requiredQuantity below one', () => {
    expect(() =>
      validateOfferConfiguration(
        bundleConfig({
          bundleItems: [
            { storeProductID: 'sp-a', requiredQuantity: 0 },
            { storeProductID: 'sp-b', requiredQuantity: 1 },
          ],
        }),
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects items without storeProductID in strict mode', () => {
    expect(() =>
      validateOfferConfiguration(
        bundleConfig({
          bundleItems: [
            { productID: 'product-a', requiredQuantity: 1 },
            { productID: 'product-b', requiredQuantity: 1 },
          ],
        }),
      ),
    ).toThrow(BadRequestException);
  });

  it('allows legacy items without storeProductID in lenient mode', () => {
    expect(() =>
      validateOfferConfiguration(
        bundleConfig({
          bundleItems: [
            { productID: 'product-a', requiredQuantity: 1 },
            { productID: 'product-b', requiredQuantity: 1 },
          ],
        }),
        { requireBundleStoreProductIDs: false },
      ),
    ).not.toThrow();
  });
});

describe('SECOND_UNIT_PERCENTAGE configuration', () => {
  const config = {
    discountType: DiscountType.SECOND_UNIT_PERCENTAGE,
    storeProductID: 'sp-1',
    value: 80,
  };

  it.each([0.01, 0.5, 20, 50, 80, 100])(
    'accepts an editable percentage of %s',
    (value) => {
      expect(() =>
        validateOfferConfiguration({ ...config, value }),
      ).not.toThrow();
    },
  );

  it.each([undefined, null, 0, -1, 0.001, 80.555, 100.01, NaN, Infinity, '80'])(
    'rejects invalid percentages: %s',
    (value) => {
      expect(() =>
        validateOfferConfiguration({
          ...config,
          value,
        } as OfferValidationInput),
      ).toThrow(BadRequestException);
    },
  );

  it.each([
    [1, 1000],
    [2, 1200],
    [3, 2200],
    [4, 2400],
  ])('simulates %s equal-price units as %s', (quantity, expected) => {
    expect(simulateOfferPrice(config as SpecialOffer, 1000, quantity)).toBe(
      expected,
    );
  });
});
