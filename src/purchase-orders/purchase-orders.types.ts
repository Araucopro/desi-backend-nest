import { PurchaseOrderItem } from './entities/purchase-order-item.entity';

export type PurchaseOrderTotals = {
  subtotal: number;
  net: number;
  tax: number;
  total: number;
};

export type PurchaseOrderVerificationSummary = {
  completos: number;
  faltantes: number;
  deMas: number;
  noEsperados: number;
};

export type PurchaseOrderVerificationScan = {
  variationID: string;
  quantityReceived: number;
  unitPrice?: number;
};

export type PurchaseOrderVerificationPlanItem =
  | { kind: 'existing'; item: PurchaseOrderItem }
  | {
      kind: 'new';
      values: {
        purchaseOrderID: string;
        variationID: string;
        unitPrice: number;
        quantityRequested: number;
        quantityReceived: number;
        subtotal: number;
      };
    };

export type PurchaseOrderVerificationPlan = {
  summary: PurchaseOrderVerificationSummary;
  items: PurchaseOrderVerificationPlanItem[];
  totals: PurchaseOrderTotals;
};
