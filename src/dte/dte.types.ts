import {
  DteDocumentPaymentType,
  DteDocumentStatus,
} from './entities/dte-document.entity';
import { OpenfacturaDocumentResponse } from './openfactura-client.service';
import { InventoryMovementReason } from '../inventory/entities/inventory-movement.entity';

export type DteCreateOptions = {
  /** Cuando es false, el stock ya salió (conversión de nota de venta). */
  reserveStock?: boolean;
  /** Venta asociada, para trazabilidad e idempotencia de conversión. */
  saleID?: string;
  /** Forma de pago real del POS, preservada aunque el payload boleta no incluya FmaPago. */
  paymentType?: DteDocumentPaymentType;
  /** Costo de venta congelado del documento original (usado en NCE 61). */
  cogsTotalOverride?: number;
  /** Razón de inventario para la reserva de stock (default SALE). */
  reserveReason?: InventoryMovementReason;
};

export type DtePreparationValues = {
  tenantID: string;
  apikey: string;
  idempotencyKey: string | null;
  purchaseOrderID: string | null;
  saleID: string | null;
  stockReserved: boolean;
  token: string;
  folio: number;
  store: { storeID: string };
  storeID: string;
  status: DteDocumentStatus;
  documentType: number | null;
  paymentType: DteDocumentPaymentType;
  total: number;
  netTotal: number;
  taxTotal: number;
  cogsTotal: number;
  issueDate: Date;
  payloadRaw: Record<string, unknown>;
  payloadNormalized: Record<string, unknown>;
  errorDetail: null;
};

export type DteFinalizePlan =
  | {
      kind: 'success';
      status: DteDocumentStatus;
      token: string;
      folio: number;
      errorDetail: null;
      extraPayload?: OpenfacturaDocumentResponse;
    }
  | {
      kind: 'error';
      status: DteDocumentStatus.ERROR;
      token: string;
      folio: number;
      errorDetail: string;
      message: string;
    };
