import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CreateSaleDto } from './dto/create-sale.dto';
import { ConvertDocumentType, ConvertSaleDto } from './dto/convert-sale.dto';
import {
  SalePaymentType,
  SaleReceiver,
  SaleType,
} from './entities/sale.entity';
import { DteDocumentPaymentType } from '../dte/entities/dte-document.entity';
import { CalculateCartResult } from '../pricing/dto/pricing.dto';
import {
  roundClp,
  splitIvaIncluded,
  TAX_RATE,
} from '../common/utils/money.util';
import { PreparedSale, PreparedSaleItem } from './sales.types';

export { TAX_RATE };

export function toMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function toDateOnly(value: string | Date): Date {
  const text =
    value instanceof Date
      ? value.toISOString().slice(0, 10)
      : String(value).slice(0, 10);
  const date = new Date(`${text}T12:00:00`);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

export function toDtePaymentType(
  paymentType: SalePaymentType,
): DteDocumentPaymentType {
  if (paymentType === SalePaymentType.CREDIT) {
    return DteDocumentPaymentType.CREDIT;
  }
  if (paymentType === SalePaymentType.DEBIT) {
    return DteDocumentPaymentType.DEBIT;
  }
  return DteDocumentPaymentType.CASH;
}

export function createSaleId(): string {
  return randomUUID();
}

export function validateFacturaReceiver(
  saleType: SaleType,
  receiver?: SaleReceiver | null,
): void {
  if (saleType === SaleType.FACTURA && (!receiver?.rut || !receiver?.name)) {
    throw new BadRequestException(
      'La factura requiere receptor con RUT y nombre',
    );
  }
}

export function validateStoreDteCapability(
  store: { hasOpenfacturaKey?: boolean; name?: string },
  saleType: SaleType,
): void {
  if (saleType !== SaleType.NOTA_VENTA && !store.hasOpenfacturaKey) {
    throw new BadRequestException(
      'La tienda no tiene configurada la API key de Openfactura. Solo se pueden emitir notas de venta.',
    );
  }
}

export function buildPreparedSale(
  dto: CreateSaleDto,
  pricing: CalculateCartResult,
): PreparedSale {
  const items: PreparedSaleItem[] = pricing.items.map((item) => ({
    storeProductID: item.storeProductID,
    variationID: item.variationID,
    productName: item.productName,
    sku: item.sku,
    quantity: item.quantity,
    unitPrice: item.finalUnitPrice,
    unitCost: item.unitCost,
    lineTotal: item.lineTotal,
    baseTotal: item.basePrice,
  }));
  const cogsTotal = toMoney(
    items.reduce((acc, item) => acc + item.unitCost * item.quantity, 0),
  );

  const total = roundClp(items.reduce((acc, item) => acc + item.lineTotal, 0));
  const subtotal = roundClp(
    items.reduce((acc, item) => acc + item.baseTotal, 0),
  );
  const discount = Math.max(subtotal - total, 0);
  const { netTotal, taxTotal } = splitIvaIncluded(total);

  return {
    saleType: dto.saleType,
    paymentType: dto.paymentType,
    issueDate: toDateOnly(dto.issueDate ?? new Date()),
    receiver: dto.receiver ?? null,
    items,
    subtotal,
    discount,
    netTotal,
    taxTotal,
    total,
    cogsTotal,
  };
}

export function resolveConversionDocumentType(
  sale: { receiver?: SaleReceiver | null },
  dto?: ConvertSaleDto,
): 33 | 39 {
  if (dto?.documentType === ConvertDocumentType.BOLETA) {
    return 39;
  }
  if (dto?.documentType === ConvertDocumentType.FACTURA) {
    return 33;
  }
  return sale.receiver?.rut ? 33 : 39;
}
