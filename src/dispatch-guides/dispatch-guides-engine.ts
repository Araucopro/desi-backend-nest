import { BadRequestException } from '@nestjs/common';
import { CreateDispatchGuideDto } from './dto/create-dispatch-guide.dto';
import {
  DispatchGuideDestination,
  DispatchGuideReceiver,
  DispatchGuideStatus,
  DispatchGuideTransport,
} from './entities/dispatch-guide.entity';
import { CalculateCartResult } from '../pricing/dto/pricing.dto';

export const TAX_RATE = 0.19;

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
  const cogsTotal = toMoney(
    items.reduce((acc, item) => acc + item.unitCost * item.quantity, 0),
  );
  const total = Math.round(
    items.reduce((acc, item) => acc + item.lineTotal, 0),
  );
  const subtotal = Math.round(
    items.reduce((acc, item) => acc + item.baseTotal, 0),
  );
  const discount = Math.max(subtotal - total, 0);
  const netTotal = Math.round(total / (1 + TAX_RATE));
  const taxTotal = total - netTotal;

  return {
    status: DispatchGuideStatus.PENDIENTE,
    issueDate: toDateOnly(dto.issueDate ?? new Date()),
    receiver: {
      rut: dto.receiver.rut,
      name: dto.receiver.name,
      ...(dto.receiver.address ? { address: dto.receiver.address } : {}),
      ...(dto.receiver.city ? { city: dto.receiver.city } : {}),
      ...(dto.receiver.giro ? { giro: dto.receiver.giro } : {}),
      ...(dto.receiver.email ? { email: dto.receiver.email } : {}),
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
 * Valida que cada ítem de la venta tenga cobertura de stock despachado en las
 * guías EMITIDA. No consume las cantidades: una misma guía puede referenciarse
 * por N facturas mientras la suma despachada alcance.
 */
export function validateDispatchGuideCoverage(
  guides: Array<{ items?: DispatchGuideCoverageItem[] }>,
  saleItems: DispatchGuideCoverageItem[],
): void {
  const dispatchedByVariation = new Map<string, number>();
  for (const guide of guides) {
    for (const item of guide.items ?? []) {
      dispatchedByVariation.set(
        item.variationID,
        (dispatchedByVariation.get(item.variationID) ?? 0) + item.quantity,
      );
    }
  }

  for (const saleItem of saleItems) {
    const available = dispatchedByVariation.get(saleItem.variationID) ?? 0;
    if (saleItem.quantity > available) {
      throw new BadRequestException(
        `La cantidad de la variación ${saleItem.variationID} (${saleItem.quantity}) supera la cobertura de las guías de despacho referenciadas (${available})`,
      );
    }
  }
}

export function assertCanAnular(status: DispatchGuideStatus): void {
  if (status !== DispatchGuideStatus.EMITIDA) {
    throw new BadRequestException(
      `Solo guías de despacho EMITIDA pueden anularse (actual: ${status})`,
    );
  }
}
