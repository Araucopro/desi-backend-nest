import { BadRequestException } from '@nestjs/common';
import { DiscountType } from './entities/special-offer.entity';
import { validateOfferConfiguration } from './offer-engine';
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
