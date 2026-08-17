import { StoreProduct } from '../relations/storeproduct/entities/storeproduct.entity';
import { StoreType } from '../stores/entities/store.entity';
import {
  DiscountScope,
  DiscountType,
  SpecialOffer,
} from './entities/special-offer.entity';
import { AppliedDiscount, BreakdownEntry } from './dto/pricing.dto';

export type MutableCartLine = {
  storeProductID: string;
  storeID: string;
  storeType?: StoreType;
  variationID: string;
  productID: string;
  productName: string;
  sku: string;
  categoryID?: string | null;
  brand?: string | null;
  model?: string | null;
  quantity: number;
  baseUnitPrice: number;
  unitCost: number;
  basePrice: number;
  currentTotal: number;
  discountsApplied: AppliedDiscount[];
  breakdown: BreakdownEntry[];
  storeProduct: StoreProduct;
};

function toMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function applyStandardOffer(line: MutableCartLine, offer: SpecialOffer) {
  const scope: DiscountScope = offer.scope ?? DiscountScope.UNIT;
  const currentUnitPrice = line.currentTotal / line.quantity;
  const previousPrice = line.currentTotal;
  let nextPrice = previousPrice;

  switch (offer.discountType) {
    case DiscountType.PERCENTAGE:
      if (scope === DiscountScope.UNIT) {
        nextPrice = currentUnitPrice * (1 - offer.value / 100) * line.quantity;
      } else {
        nextPrice = previousPrice * (1 - offer.value / 100);
      }
      break;
    case DiscountType.FIXED_AMOUNT:
      if (scope === DiscountScope.UNIT) {
        nextPrice = Math.max(0, currentUnitPrice - offer.value) * line.quantity;
      } else {
        nextPrice = Math.max(0, previousPrice - offer.value);
      }
      break;
    case DiscountType.FIXED_PRICE:
      nextPrice =
        scope === DiscountScope.UNIT
          ? offer.value * line.quantity
          : offer.value;
      break;
    default:
      return;
  }

  nextPrice = toMoney(Math.max(0, nextPrice));
  line.currentTotal = nextPrice;
  recordAutomaticDiscount(line, offer, previousPrice, nextPrice, scope);
}

export function applyBuyXGetY(lines: MutableCartLine[], offer: SpecialOffer) {
  const buyQuantity = offer.buyQuantity ?? 0;
  const payQuantity = offer.payQuantity ?? 0;
  if (buyQuantity <= 0 || payQuantity <= 0 || buyQuantity <= payQuantity) {
    return;
  }
  const totalUnits = lines.reduce((acc, line) => acc + line.quantity, 0);
  const groups = Math.floor(totalUnits / buyQuantity);
  const freeUnits = groups * (buyQuantity - payQuantity);
  if (freeUnits <= 0) return;
  grantFreeUnits(lines, freeUnits, offer, 'buyXGetY', {
    buyQuantity,
    payQuantity,
    groups,
    freeUnits,
  });
}

export function applyBundle(lines: MutableCartLine[], offer: SpecialOffer) {
  const bundleItems = offer.bundleItems ?? [];
  if (bundleItems.length < 2) return;
  const quantitiesByProduct = new Map<string, number>();
  for (const line of lines) {
    quantitiesByProduct.set(
      line.productID,
      (quantitiesByProduct.get(line.productID) ?? 0) + line.quantity,
    );
  }
  let sets = Number.POSITIVE_INFINITY;
  for (const item of bundleItems) {
    const quantity = quantitiesByProduct.get(item.productID) ?? 0;
    const required = Math.max(1, item.requiredQuantity);
    sets = Math.min(sets, Math.floor(quantity / required));
  }
  if (!Number.isFinite(sets) || sets <= 0) return;
  const freeUnits = sets;
  grantFreeUnits(lines, freeUnits, offer, 'bundle', {
    sets,
    freeUnits,
  });
}

export function grantFreeUnits(
  lines: MutableCartLine[],
  count: number,
  offer: SpecialOffer,
  step: string,
  details: Record<string, unknown>,
) {
  const candidates = lines
    .map((line) => ({
      line,
      unitPrice: line.currentTotal / line.quantity,
    }))
    .filter((candidate) => candidate.unitPrice > 0)
    .sort(
      (left, right) =>
        left.unitPrice - right.unitPrice ||
        left.line.storeProductID.localeCompare(right.line.storeProductID),
    );

  let remaining = count;
  for (const candidate of candidates) {
    if (remaining <= 0) break;
    const free = Math.min(candidate.line.quantity, remaining);
    const previousPrice = candidate.line.currentTotal;
    const freeValue = toMoney(free * candidate.unitPrice);
    const nextPrice = toMoney(Math.max(0, previousPrice - freeValue));
    if (nextPrice === previousPrice) continue;

    candidate.line.currentTotal = nextPrice;
    recordAutomaticDiscount(
      candidate.line,
      offer,
      previousPrice,
      nextPrice,
      DiscountScope.TOTAL,
      { ...details, freeUnits: free },
    );
    remaining -= free;
  }
}

export function recordAutomaticDiscount(
  line: MutableCartLine,
  offer: SpecialOffer,
  previousPrice: number,
  resultingPrice: number,
  scope: DiscountScope,
  details?: Record<string, unknown>,
) {
  line.discountsApplied.push({
    source: 'AUTO',
    applied: true,
    previousPrice,
    resultingPrice,
    scope,
    offerID: offer.offerID,
    description: offer.description,
    discountType: offer.discountType,
    value: offer.value,
    exclusive: !!offer.exclusive,
    priority: offer.priority,
    details,
  });
  line.breakdown.push({
    step: details ? 'cartOffer' : 'automaticOffer',
    previousPrice,
    newPrice: resultingPrice,
    delta: toMoney(resultingPrice - previousPrice),
    scope,
    details: details ?? {
      offerID: offer.offerID,
      type: offer.discountType,
      value: offer.value,
      priority: offer.priority,
    },
  });
}

export function applyManualDiscount(
  line: MutableCartLine,
  manualDiscount: number,
) {
  const previousPrice = line.currentTotal;
  const resultingPrice = toMoney(
    Math.max(0, previousPrice * (1 - manualDiscount / 100)),
  );
  line.currentTotal = resultingPrice;
  line.discountsApplied.push({
    source: 'MANUAL',
    applied: true,
    previousPrice,
    resultingPrice,
    scope: 'TOTAL',
    manualDiscount,
  });
  line.breakdown.push({
    step: 'manualDiscount',
    previousPrice,
    newPrice: resultingPrice,
    delta: toMoney(resultingPrice - previousPrice),
    scope: 'TOTAL',
    details: { manualDiscount },
  });
}

export function recordManualIgnored(
  line: MutableCartLine,
  manualDiscount: number,
) {
  line.discountsApplied.push({
    source: 'MANUAL',
    applied: false,
    previousPrice: line.currentTotal,
    resultingPrice: line.currentTotal,
    scope: 'TOTAL',
    manualDiscount,
    reasonIgnored: 'exclusive_offer',
  });
  line.breakdown.push({
    step: 'manualDiscount_ignored',
    previousPrice: line.currentTotal,
    newPrice: line.currentTotal,
    delta: 0,
    scope: 'TOTAL',
    details: { reason: 'exclusive_offer' },
  });
}
