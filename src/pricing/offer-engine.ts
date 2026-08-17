import { BadRequestException } from '@nestjs/common';
import {
  DiscountScope,
  DiscountType,
  OfferTargetScope,
  SpecialOffer,
} from './entities/special-offer.entity';
import { OfferCartItem, OfferValidationInput } from './offer.types';

export function validateOfferConfiguration(config: OfferValidationInput): void {
  const targetScope = config.targetScope ?? OfferTargetScope.VARIATION;

  if (config.discountType === DiscountType.BUY_X_GET_Y) {
    const buy = config.buyQuantity;
    const pay = config.payQuantity;
    if (!buy || !pay || buy <= pay || pay < 1) {
      throw new BadRequestException(
        'BUY_X_GET_Y requiere buyQuantity > payQuantity >= 1',
      );
    }
  }

  if (config.discountType === DiscountType.BUNDLE) {
    if (!config.bundleItems || config.bundleItems.length < 2) {
      throw new BadRequestException('BUNDLE requiere al menos 2 bundleItems');
    }
    for (const item of config.bundleItems) {
      if (!item.productID || (item.requiredQuantity ?? 1) < 1) {
        throw new BadRequestException(
          'Cada bundleItem requiere productID y requiredQuantity >= 1',
        );
      }
    }
  }

  if (targetScope === OfferTargetScope.VARIATION) {
    if (!config.storeProductID) {
      throw new BadRequestException(
        'targetScope VARIATION requiere storeProductID',
      );
    }
    return;
  }

  if (!config.storeID) {
    throw new BadRequestException(
      'Los alcances distintos de VARIATION requieren storeID',
    );
  }

  if (
    targetScope === OfferTargetScope.PRODUCT &&
    (!config.productIDs || config.productIDs.length === 0)
  ) {
    throw new BadRequestException(
      'targetScope PRODUCT requiere al menos un productID',
    );
  }
  if (targetScope === OfferTargetScope.CATEGORY && !config.categoryID) {
    throw new BadRequestException('targetScope CATEGORY requiere categoryID');
  }
  if (targetScope === OfferTargetScope.BRAND && !config.brand) {
    throw new BadRequestException('targetScope BRAND requiere brand');
  }
  if (targetScope === OfferTargetScope.MODEL && !config.model) {
    throw new BadRequestException('targetScope MODEL requiere model');
  }
}

export function validateDateRange(
  startDateValue: string | Date,
  endDateValue?: string | Date | null,
): void {
  if (!endDateValue) {
    return;
  }

  const startDate = new Date(startDateValue);
  const endDate = new Date(endDateValue);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new BadRequestException('Rango de fechas invalido para la oferta');
  }

  if (endDate < startDate) {
    throw new BadRequestException(
      'La fecha de termino no puede ser anterior al inicio',
    );
  }
}

export function simulateOfferPrice(
  offer: SpecialOffer,
  unitPrice: number,
  quantity: number,
): number {
  const currentPrice = unitPrice * quantity;
  const currentUnitPrice = quantity > 0 ? currentPrice / quantity : 0;
  const scope = offer.scope ?? DiscountScope.UNIT;

  switch (offer.discountType) {
    case DiscountType.PERCENTAGE:
      if (scope === DiscountScope.UNIT) {
        return currentUnitPrice * (1 - offer.value / 100) * quantity;
      }
      return currentPrice * (1 - offer.value / 100);
    case DiscountType.FIXED_AMOUNT:
      if (scope === DiscountScope.UNIT) {
        return Math.max(0, currentUnitPrice - offer.value) * quantity;
      }
      return Math.max(0, currentPrice - offer.value);
    case DiscountType.FIXED_PRICE:
      return scope === DiscountScope.UNIT
        ? offer.value * quantity
        : offer.value;
    case DiscountType.BUY_X_GET_Y:
      if (offer.buyQuantity && offer.payQuantity) {
        const groups = Math.floor(quantity / offer.buyQuantity);
        return Math.max(
          0,
          currentPrice -
            groups * (offer.buyQuantity - offer.payQuantity) * currentUnitPrice,
        );
      }
      return currentPrice;
    case DiscountType.BUNDLE:
    default:
      return currentPrice;
  }
}

export function resolveOfferPriority(offer: SpecialOffer): number {
  let priority = 0;

  if (offer.exclusive) {
    priority += 100;
  }
  if ((offer.scope ?? DiscountScope.UNIT) === DiscountScope.TOTAL) {
    priority += 10;
  }
  if (offer.discountType === DiscountType.FIXED_PRICE) {
    priority += 5;
  }

  return priority;
}

export function sortOffers(left: SpecialOffer, right: SpecialOffer): number {
  const priorityDiff = (left.priority ?? 0) - (right.priority ?? 0);
  if (priorityDiff !== 0) return priorityDiff;
  const startDiff =
    (right.startDate?.getTime?.() ?? 0) - (left.startDate?.getTime?.() ?? 0);
  if (startDiff !== 0) return startDiff;
  const createdDiff =
    (right.createdAt?.getTime?.() ?? 0) - (left.createdAt?.getTime?.() ?? 0);
  if (createdDiff !== 0) return createdDiff;
  return left.offerID.localeCompare(right.offerID);
}

export function matchesOffer(
  item: OfferCartItem,
  offer: SpecialOffer,
  categoryScopes: Map<string, Set<string>>,
): boolean {
  switch (offer.targetScope) {
    case OfferTargetScope.STORE:
      return offer.storeID === item.storeID;
    case OfferTargetScope.PRODUCT:
      return Boolean(
        offer.productTargets?.some(
          (target) => target.productID === item.productID,
        ),
      );
    case OfferTargetScope.CATEGORY:
      if (!offer.categoryID) return false;
      return (
        categoryScopes.get(offer.categoryID)?.has(item.categoryID ?? '') ??
        false
      );
    case OfferTargetScope.BRAND:
      return Boolean(offer.brand && offer.brand === item.brand);
    case OfferTargetScope.MODEL:
      return Boolean(offer.model && offer.model === item.model);
    case OfferTargetScope.VARIATION:
    default:
      return offer.storeProductID === item.storeProductID;
  }
}
