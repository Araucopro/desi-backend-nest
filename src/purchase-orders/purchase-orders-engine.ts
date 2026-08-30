import { randomBytes } from 'crypto';
import { BadRequestException } from '@nestjs/common';
import { PurchaseOrderCommercialStatus } from './entities/purchase-order.entity';
import { PurchaseOrderItem } from './entities/purchase-order-item.entity';
import {
  PurchaseOrderTotals,
  PurchaseOrderVerificationPlan,
  PurchaseOrderVerificationScan,
  PurchaseOrderVerificationSummary,
} from './purchase-orders.types';

export const TAX_RATE = 0.19;

export function toMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function createPurchaseOrderFolio(): string {
  return randomBytes(3).toString('hex');
}

export function calculateTotals(
  items: Array<Pick<PurchaseOrderItem, 'subtotal'>>,
  discount: number,
): PurchaseOrderTotals {
  const subtotal = toMoney(items.reduce((acc, item) => acc + item.subtotal, 0));
  const net = toMoney(Math.max(subtotal - discount, 0));
  const tax = toMoney(net * TAX_RATE);
  const total = toMoney(net + tax);

  return { subtotal, net, tax, total };
}

export function ensureCommercialStatusTransition(
  currentStatus: PurchaseOrderCommercialStatus,
  nextStatus: PurchaseOrderCommercialStatus,
): void {
  if (currentStatus === nextStatus) {
    return;
  }

  const allowedTransitions: Record<
    PurchaseOrderCommercialStatus,
    PurchaseOrderCommercialStatus[]
  > = {
    [PurchaseOrderCommercialStatus.PENDIENTE]: [
      PurchaseOrderCommercialStatus.ENVIADO,
      PurchaseOrderCommercialStatus.RECHAZADO,
    ],
    [PurchaseOrderCommercialStatus.ENVIADO]: [
      PurchaseOrderCommercialStatus.ACEPTADO,
      PurchaseOrderCommercialStatus.RECHAZADO,
    ],
    [PurchaseOrderCommercialStatus.ACEPTADO]: [],
    [PurchaseOrderCommercialStatus.RECHAZADO]: [],
  };

  if (!allowedTransitions[currentStatus].includes(nextStatus)) {
    throw new BadRequestException(
      `No se puede cambiar el estado de ${currentStatus} a ${nextStatus}`,
    );
  }
}

export function buildVerificationPlan(input: {
  purchaseOrderID: string;
  items: PurchaseOrderItem[];
  scans: PurchaseOrderVerificationScan[];
  discount: number;
}): PurchaseOrderVerificationPlan {
  const { purchaseOrderID, items, scans, discount } = input;
  const itemsMap = new Map<string, PurchaseOrderItem>();

  for (const item of items) {
    itemsMap.set(item.variation.variationID, item);
  }

  const scannedVariations = new Set<string>();
  const summary: PurchaseOrderVerificationSummary = {
    completos: 0,
    faltantes: 0,
    deMas: 0,
    noEsperados: 0,
  };
  const plannedItems: PurchaseOrderVerificationPlan['items'] = [];
  const totalItems: Array<Pick<PurchaseOrderItem, 'subtotal'>> = [...items];

  for (const scan of scans) {
    scannedVariations.add(scan.variationID);

    const existing = itemsMap.get(scan.variationID);
    const received = scan.quantityReceived;
    const unitPrice = scan.unitPrice ?? existing?.unitPrice ?? 0;

    if (existing) {
      const diff = received - existing.quantityRequested;
      if (diff === 0) summary.completos += 1;
      if (diff > 0) summary.deMas += diff;
      if (diff < 0) summary.faltantes += Math.abs(diff);

      const previousReceived = existing.quantityReceived ?? 0;
      const delta = received - previousReceived;
      if (delta < 0) {
        throw new BadRequestException(
          'No se puede reducir la cantidad ya recibida en la verificación',
        );
      }

      existing.quantityReceived = received;
      if (received > existing.quantityRequested) {
        existing.quantityRequested = received;
      }
      existing.unitPrice = unitPrice;
      existing.subtotal = toMoney(
        existing.unitPrice * existing.quantityRequested,
      );
      plannedItems.push({ kind: 'existing', item: existing });
    } else {
      summary.noEsperados += received;
      const values = {
        purchaseOrderID,
        variationID: scan.variationID,
        unitPrice,
        quantityRequested: received,
        quantityReceived: received,
        subtotal: toMoney(unitPrice * received),
      };
      plannedItems.push({ kind: 'new', values });
      totalItems.push({ subtotal: values.subtotal });
    }
  }

  for (const item of itemsMap.values()) {
    if (!scannedVariations.has(item.variation.variationID)) {
      const missing = item.quantityRequested - (item.quantityReceived ?? 0);
      if (missing > 0) {
        summary.faltantes += missing;
      }
    }
  }

  const totals = calculateTotals(totalItems, discount);

  return { summary, items: plannedItems, totals };
}
