import { DteDocumentResponseDto } from '../dte/dto/dte-document-response.dto';
import {
  Sale,
  SalePaymentType,
  SaleReceiver,
  SaleType,
} from './entities/sale.entity';

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
  paymentType: SalePaymentType;
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
  sale: Sale;
  dte: DteDocumentResponseDto | null;
};
