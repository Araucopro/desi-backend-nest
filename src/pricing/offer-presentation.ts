import { DiscountType, SpecialOffer } from './entities/special-offer.entity';
import { AppliedDiscount } from './dto/pricing.dto';

export type OfferPromotion = {
  offerID: string;
  discountType: DiscountType;
  label: string;
  description: string | null;
  buyQuantity: number | null;
  payQuantity: number | null;
};

type PromotionSource = Pick<
  SpecialOffer,
  | 'offerID'
  | 'discountType'
  | 'description'
  | 'buyQuantity'
  | 'payQuantity'
  | 'value'
>;

function present(source: PromotionSource): OfferPromotion {
  const buy = source.buyQuantity ?? null;
  const pay = source.payQuantity ?? null;
  const label =
    source.discountType === DiscountType.BUY_X_GET_Y
      ? buy && pay
        ? buy + 'x' + pay
        : 'Promoción por cantidad'
      : source.discountType === DiscountType.BUNDLE
        ? 'Combo'
        : source.discountType === DiscountType.PERCENTAGE
          ? source.value + '% de descuento'
          : source.discountType === DiscountType.FIXED_PRICE
            ? 'Precio especial'
            : 'Descuento';
  return {
    offerID: source.offerID,
    discountType: source.discountType,
    label,
    description: source.description?.trim() || null,
    buyQuantity: buy,
    payQuantity: pay,
  };
}

/** Public metadata only; callers must supply offers already matched to tenant, store and channel. */
export function availablePromotions(offers: SpecialOffer[]): OfferPromotion[] {
  const summaries: OfferPromotion[] = [];
  for (const offer of offers) {
    summaries.push(present(offer));
    if (offer.exclusive) break;
  }
  return summaries;
}

export function appliedPromotions(
  discounts: AppliedDiscount[],
): OfferPromotion[] {
  return discounts.flatMap((discount) => {
    if (
      discount.source !== 'AUTO' ||
      !discount.applied ||
      !discount.offerID ||
      discount.resultingPrice >= discount.previousPrice ||
      !Object.values(DiscountType).includes(
        discount.discountType as DiscountType,
      )
    )
      return [];
    const quantity = (name: string) =>
      typeof discount.details?.[name] === 'number'
        ? (discount.details[name] as number)
        : null;
    return [
      present({
        offerID: discount.offerID,
        discountType: discount.discountType as DiscountType,
        description: discount.description,
        value: discount.value ?? 0,
        buyQuantity: quantity('buyQuantity'),
        payQuantity: quantity('payQuantity'),
      }),
    ];
  });
}
