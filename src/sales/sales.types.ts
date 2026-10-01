import { DteDocumentResponseDto } from '../dte/dto/dte-document-response.dto';
import { PaymentStatus } from '../cash-registers/entities/payment.entity';
import { PaymentMethodType } from '../cash-registers/entities/payment-method.entity';
import {
  Sale,
  SaleFmaPago,
  SaleReceiver,
  SaleType,
} from './entities/sale.entity';

export type SalePaymentSummary = {
  paymentID: string;
  paymentMethodID: string;
  paymentMethod: {
    paymentMethodID: string;
    code: string;
    name: string;
    type: PaymentMethodType;
  } | null;
  amount: number;
  status: PaymentStatus;
  paidAt: Date;
  authorizationCode: string | null;
  transactionID: string | null;
  reference: string | null;
};

export type PreparedSaleItem = {
  storeProductID: string;
  variationID: string;
  productName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  lineTotal: number;
  baseTotal: number;
};

export type PreparedSale = {
  saleType: SaleType;
  fmaPago: SaleFmaPago;
  issueDate: Date;
  receiver: SaleReceiver | null;
  clientID?: string | null;
  items: PreparedSaleItem[];
  subtotal: number;
  discount: number;
  netTotal: number;
  taxTotal: number;
  total: number;
  cogsTotal: number;
};

export type SaleView = {
  sale: Omit<Sale, 'payments'> & { payments: SalePaymentSummary[] };
  dte: DteDocumentResponseDto | null;
};
