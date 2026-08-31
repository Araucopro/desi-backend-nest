import { BadRequestException } from '@nestjs/common';
import { CreateDispatchGuideDto } from './dto/create-dispatch-guide.dto';
import {
  DispatchGuideDestination,
  DispatchGuideReceiver,
  DispatchGuideStatus,
  DispatchGuideTransport,
} from './entities/dispatch-guide.entity';
import { CalculateCartResult } from '../pricing/dto/pricing.dto';
import {
  roundClp,
  splitIvaIncluded,
  TAX_RATE,
} from '../common/utils/money.util';

export { TAX_RATE };

export type PreparedDispatchGuideItem = {
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

export type PreparedDispatchGuide = {
  status: DispatchGuideStatus;
  issueDate: Date;
  indTraslado: string;
  includePrices: boolean;
  receiver: DispatchGuideReceiver;
  destination: DispatchGuideDestination;
  transport: DispatchGuideTransport | null;
  items: PreparedDispatchGuideItem[];
  subtotal: number;
  discount: number;
  netTotal: number;
  taxTotal: number;
  total: number;
  cogsTotal: number;
};

export type DispatchGuideCoverageItem = {
  variationID: string;
  quantity: number;
};

export type DispatchGuideConsumptionItem = {
  dispatchGuideID: string;
  variationID: string;
  quantity: number;
};

export type DispatchGuideResolvedItem = {
  storeProductID: string;
  variationID: string;
  productName: string;
  sku: string;
  quantity: number;
};

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

export function validateDispatchGuideRequest(
  dto: CreateDispatchGuideDto,
): void {
  if (!dto.receiver) {
    throw new BadRequestException(
      'La guía de despacho requiere datos del receptor',
    );
  }
  if (!dto.receiver.rut || !dto.receiver.name) {
    throw new BadRequestException(
      'El receptor de la guía requiere RUT y nombre',
    );
  }
  if (!dto.destination) {
    throw new BadRequestException(
      'La guía de despacho requiere destino de la mercadería',
    );
  }
  if (!dto.destination.address?.trim() || !dto.destination.city?.trim()) {
    throw new BadRequestException(
      'El destino de la guía requiere dirección y comuna',
    );
  }
  if (!dto.items?.length) {
    throw new BadRequestException(
      'La guía de despacho requiere al menos un ítem',
    );
  }
}

export function buildPreparedDispatchGuide(
  dto: CreateDispatchGuideDto,
  pricing: CalculateCartResult,
): PreparedDispatchGuide {
  validateDispatchGuideRequest(dto);

  const items: PreparedDispatchGuideItem[] = pricing.items.map((item) => ({
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
  return buildPreparedDispatchGuideWithItems(dto, items);
}

export function buildPreparedDispatchGuideWithoutPrices(
  dto: CreateDispatchGuideDto,
  resolvedItems: DispatchGuideResolvedItem[],
): PreparedDispatchGuide {
  validateDispatchGuideRequest(dto);
  if (dto.manualDiscount !== undefined) {
    throw new BadRequestException(
      'Las guías de despacho sin precios no admiten descuento manual',
    );
  }

  const items: PreparedDispatchGuideItem[] = resolvedItems.map((item) => ({
    storeProductID: item.storeProductID,
    variationID: item.variationID,
    productName: item.productName,
    sku: item.sku,
    quantity: item.quantity,
    unitPrice: 0,
    unitCost: 0,
    lineTotal: 0,
    baseTotal: 0,
  }));

  return buildPreparedDispatchGuideWithItems(dto, items);
}

function buildPreparedDispatchGuideWithItems(
  dto: CreateDispatchGuideDto,
  items: PreparedDispatchGuideItem[],
): PreparedDispatchGuide {
  validateDispatchGuideRequest(dto);
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
    status: DispatchGuideStatus.PENDIENTE,
    issueDate: toDateOnly(dto.issueDate ?? new Date()),
    indTraslado: dto.indTraslado ?? '1',
    includePrices: dto.includePrices ?? true,
    receiver: {
      rut: dto.receiver!.rut,
      name: dto.receiver!.name,
      ...(dto.receiver!.address ? { address: dto.receiver!.address } : {}),
      ...(dto.receiver!.city ? { city: dto.receiver!.city } : {}),
      ...(dto.receiver!.giro ? { giro: dto.receiver!.giro } : {}),
      ...(dto.receiver!.email ? { email: dto.receiver!.email } : {}),
    },
    destination: {
      address: dto.destination.address,
      city: dto.destination.city,
    },
    transport: dto.transport
      ? {
          ...(dto.transport.patente ? { patente: dto.transport.patente } : {}),
          ...(dto.transport.rutConductor
            ? { rutConductor: dto.transport.rutConductor }
            : {}),
          ...(dto.transport.nombreConductor
            ? { nombreConductor: dto.transport.nombreConductor }
            : {}),
          ...(dto.transport.fechaTraslado
            ? { fechaTraslado: dto.transport.fechaTraslado }
            : {}),
        }
      : null,
    items,
    subtotal,
    discount,
    netTotal,
    taxTotal,
    total,
    cogsTotal,
  };
}

/**
 * Calcula el saldo restante por guía/variación:
 * cantidad despachada menos consumo ya registrado en DispatchGuideReferenceItem.
 */
export function getRemainingQuantities(
  guides: Array<{
    dispatchGuideID: string;
    items?: DispatchGuideCoverageItem[];
  }>,
  consumedItems: DispatchGuideConsumptionItem[],
): Map<string, Map<string, number>> {
  const remaining = new Map<string, Map<string, number>>();

  for (const guide of guides) {
    const byVariation = new Map<string, number>();
    for (const item of guide.items ?? []) {
      byVariation.set(
        item.variationID,
        (byVariation.get(item.variationID) ?? 0) + item.quantity,
      );
    }
    remaining.set(guide.dispatchGuideID, byVariation);
  }

  for (const consumed of consumedItems) {
    const byVariation = remaining.get(consumed.dispatchGuideID);
    if (!byVariation) continue;
    byVariation.set(
      consumed.variationID,
      Math.max(
        (byVariation.get(consumed.variationID) ?? 0) - consumed.quantity,
        0,
      ),
    );
  }

  return remaining;
}

/**
 * Asigna el consumo de una factura/boleta entre las guías en el orden
 * determinístico entregado por el cliente, validando contra el saldo
 * acumulado (despachado − consumido). Devuelve los ítems de consumo a
 * persistir junto con DispatchGuideReference.
 */
export function planConsumption(
  guides: Array<{
    dispatchGuideID: string;
    items?: DispatchGuideCoverageItem[];
  }>,
  consumedItems: DispatchGuideConsumptionItem[],
  saleItems: DispatchGuideCoverageItem[],
): DispatchGuideConsumptionItem[] {
  const remaining = getRemainingQuantities(guides, consumedItems);
  const plan: DispatchGuideConsumptionItem[] = [];

  for (const saleItem of saleItems) {
    let needed = saleItem.quantity;
    let availableTotal = 0;
    for (const guide of guides) {
      availableTotal +=
        remaining.get(guide.dispatchGuideID)?.get(saleItem.variationID) ?? 0;
    }
    if (needed > availableTotal) {
      throw new BadRequestException(
        `La cantidad de la variación ${saleItem.variationID} (${saleItem.quantity}) supera el saldo acumulado disponible de las guías de despacho referenciadas (${availableTotal})`,
      );
    }

    for (const guide of guides) {
      if (needed <= 0) break;
      const byVariation = remaining.get(guide.dispatchGuideID);
      if (!byVariation) continue;
      const available = byVariation.get(saleItem.variationID) ?? 0;
      if (available <= 0) continue;

      const taken = Math.min(needed, available);
      byVariation.set(saleItem.variationID, available - taken);
      plan.push({
        dispatchGuideID: guide.dispatchGuideID,
        variationID: saleItem.variationID,
        quantity: taken,
      });
      needed -= taken;
    }
  }

  return plan;
}

/**
 * Compatibilidad con la validación pre-consumo: una misma guía puede
 * referenciarse por N facturas mientras la suma despachada alcance.
 */
export function validateDispatchGuideCoverage(
  guides: Array<{ items?: DispatchGuideCoverageItem[] }>,
  saleItems: DispatchGuideCoverageItem[],
): void {
  planConsumption(
    guides.map((guide, index) => ({
      dispatchGuideID:
        (guide as { dispatchGuideID?: string }).dispatchGuideID ??
        `guide-${index}`,
      items: guide.items,
    })),
    [],
    saleItems,
  );
}

export function assertCanReference(guide: {
  status: DispatchGuideStatus;
  folio?: number | null;
  dteDocumentID?: string | null;
}): void {
  if (guide.status !== DispatchGuideStatus.EMITIDA) {
    throw new BadRequestException(
      `Solo guías de despacho EMITIDA pueden referenciarse (actual: ${guide.status})`,
    );
  }
  if (!guide.folio || !guide.dteDocumentID) {
    throw new BadRequestException(
      'La guía de despacho no tiene folio SII o documento DTE asociado para ser referenciada',
    );
  }
}

export function assertCanAnular(status: DispatchGuideStatus): void {
  if (status !== DispatchGuideStatus.EMITIDA) {
    throw new BadRequestException(
      `Solo guías de despacho EMITIDA pueden anularse (actual: ${status})`,
    );
  }
}

export function assertCanConfirmAnulacion(status: DispatchGuideStatus): void {
  if (status !== DispatchGuideStatus.ANULACION_PENDIENTE) {
    throw new BadRequestException(
      `Solo guías de despacho ANULACION_PENDIENTE pueden confirmar su anulación (actual: ${status})`,
    );
  }
}
