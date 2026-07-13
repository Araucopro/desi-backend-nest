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

export type PricingResult = {
  basePrice: number;
  finalPrice: number;
  breakdown: BreakdownEntry[];
  discountApplied: boolean;
  discountsApplied: AppliedDiscount[];
  discountDetails?: AppliedDiscount | null;
  pricingContext: PricingContext;
};
