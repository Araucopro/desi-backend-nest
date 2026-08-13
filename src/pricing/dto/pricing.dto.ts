import { DiscountScope } from '../entities/special-offer.entity';
import { StoreType } from '../../stores/entities/store.entity';

export type BreakdownEntry = {
  step: string;
  previousPrice: number;
  newPrice: number;
  delta: number;
  scope: DiscountScope | string;
  details?: Record<string, unknown>;
};

export type AppliedDiscount = {
  source: 'AUTO' | 'MANUAL';
  applied: boolean;
  previousPrice: number;
  resultingPrice: number;
  scope: DiscountScope | 'TOTAL';
  offerID?: string;
  description?: string;
  discountType?: string;
  value?: number;
  manualDiscount?: number;
  exclusive?: boolean;
  reasonIgnored?: string;
  priority?: number;
  details?: Record<string, unknown>;
};

export type PricingContext = {
  pricingDate: string;
  storeID?: string;
  productID?: string;
  variationID?: string;
  storeType?: StoreType;
};

export type PricingInput = {
  storeProductID: string;
  quantity?: number;
  userID?: string | null;
  manualDiscount?: number; // percentage (0-100)
  // Optional preloaded values to avoid DB queries in bulk operations
  baseUnitPrice?: number;
  priceCost?: number;
  pricingDate?: string | Date;
};

export type CartItemInput = {
  storeProductID: string;
  quantity: number;
  // Optional overrides for flows that already know the base values.
  baseUnitPrice?: number;
  priceCost?: number;
};

export type CalculateCartInput = {
  storeID?: string;
  items: CartItemInput[];
  userID?: string | null;
  manualDiscount?: number;
  pricingDate?: string | Date;
};

export type CartPricingItem = {
  storeProductID: string;
  variationID: string;
  productID: string;
  productName: string;
  sku: string;
  quantity: number;
  baseUnitPrice: number;
  unitCost: number;
  basePrice: number;
  finalUnitPrice: number;
  lineTotal: number;
  discountsApplied: AppliedDiscount[];
  breakdown: BreakdownEntry[];
};

export type CalculateCartResult = {
  items: CartPricingItem[];
  totals: {
    subtotal: number;
    discount: number;
    total: number;
  };
  pricingContext: PricingContext;
};

export type PricingResult = {
  basePrice: number;
  finalPrice: number;
  breakdown: BreakdownEntry[];
  discountApplied: boolean;
  discountsApplied: AppliedDiscount[];
  discountDetails?: AppliedDiscount | null;
  pricingContext: PricingContext;
};
