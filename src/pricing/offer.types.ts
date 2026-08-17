import { CreateSpecialOfferBundleItemDto } from './dto/create-special-offer.dto';
import {
  DiscountType,
  OfferTargetScope,
} from './entities/special-offer.entity';

export type OfferCartItem = {
  storeProductID: string;
  storeID: string;
  productID: string;
  variationID: string;
  categoryID?: string | null;
  brand?: string | null;
  model?: string | null;
  quantity: number;
  unitPrice: number;
};

export type OfferCartContext = {
  storeID: string;
  pricingDate: Date;
  items: OfferCartItem[];
};

export type OfferValidationInput = {
  discountType: DiscountType;
  targetScope?: OfferTargetScope;
  storeProductID?: string | null;
  storeID?: string | null;
  productIDs?: string[];
  categoryID?: string | null;
  brand?: string | null;
  model?: string | null;
  buyQuantity?: number | null;
  payQuantity?: number | null;
  bundleItems?: CreateSpecialOfferBundleItemDto[];
};
