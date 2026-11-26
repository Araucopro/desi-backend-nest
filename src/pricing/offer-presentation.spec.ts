import { appliedPromotions, availablePromotions } from './offer-presentation';
import { DiscountType, SpecialOffer } from './entities/special-offer.entity';
import { AppliedDiscount } from './dto/pricing.dto';
const offer = {
  offerID: 'offer-1',
  discountType: DiscountType.BUY_X_GET_Y,
  description: 'Calzado',
  value: 0,
  buyQuantity: 2,
  payQuantity: 1,
  tenantID: 'private',
  allowBelowMargin: true,
  priority: 10,
} as SpecialOffer;
describe('public promotion metadata', () => {
  it('describes the configured percentage in available and applied promotions', () => {
    const secondUnit = {
      ...offer,
      discountType: DiscountType.SECOND_UNIT_PERCENTAGE,
      value: 65,
    };
    const available = availablePromotions([secondUnit]);
    expect(available[0]).toMatchObject({
      label: '65% de descuento en la segunda unidad de menor precio',
      buyQuantity: 2,
      payQuantity: null,
    });
    expect(
      appliedPromotions([
        {
          source: 'AUTO',
          applied: true,
          offerID: offer.offerID,
          description: offer.description,
          discountType: DiscountType.SECOND_UNIT_PERCENTAGE,
          value: 65,
          previousPrice: 1000,
          resultingPrice: 350,
          scope: 'TOTAL',
          details: { buyQuantity: 2, discountedUnits: 1 },
        },
      ]),
    ).toEqual(available);
  });
  it('describes quantity offers without exposing tenant or pricing permissions', () => {
    expect(availablePromotions([offer])).toEqual([
      {
        offerID: 'offer-1',
        discountType: 'BUY_X_GET_Y',
        description: 'Calzado',
        label: '2x1',
        buyQuantity: 2,
        payQuantity: 1,
      },
    ]);
  });
  it('stops advertising offers after an exclusive rule', () => {
    expect(
      availablePromotions([
        { ...offer, exclusive: true },
        { ...offer, offerID: 'ignored' },
      ]),
    ).toHaveLength(1);
  });
  it('identifies the free line as a real applied 2x1 discount', () => {
    const discount = {
      source: 'AUTO',
      applied: true,
      offerID: 'offer-1',
      discountType: 'BUY_X_GET_Y',
      description: 'Calzado',
      previousPrice: 1000,
      resultingPrice: 0,
      scope: 'TOTAL',
      details: { buyQuantity: 2, payQuantity: 1 },
    } as AppliedDiscount;
    expect(appliedPromotions([discount])).toEqual(availablePromotions([offer]));
    expect(appliedPromotions([{ ...discount, resultingPrice: 1000 }])).toEqual(
      [],
    );
    expect(appliedPromotions([{ ...discount, applied: false }])).toEqual([]);
    expect(appliedPromotions([{ ...discount, source: 'MANUAL' }])).toEqual([]);
  });
});
