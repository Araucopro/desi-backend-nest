import { BadRequestException } from '@nestjs/common';
import { Return, ReturnStatus, ReturnType } from './entities/return.entity';
import { ReturnItemCondition } from './entities/return-item.entity';
import { Sale, SaleType } from '../sales/entities/sale.entity';
import {
  roundClp,
  splitIvaIncluded,
  TAX_RATE,
} from '../common/utils/money.util';

export { TAX_RATE };

export type ReturnableItemInput = {
  saleItemID: string;
  quantity: number;
  condition?: ReturnItemCondition;
};

export type PreparedReturnItem = {
  saleItemID: string;
  storeProductID: string;
  variationID: string;
  productName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  lineTotal: number;
  condition: ReturnItemCondition;
};

export type PreparedReturn = {
  returnType: ReturnType;
  reason: string | null;
  issueDate: Date;
  items: PreparedReturnItem[];
  subtotal: number;
  discountAmount: number;
  netTotal: number;
  taxTotal: number;
  total: number;
  cogsTotal: number;
};

export type EffectiveDocument = {
  requiresNce: boolean;
  documentType: 33 | 39 | null;
  codRef: '1' | '6' | '4' | null;
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

export function activeReturnStatuses(): ReturnStatus[] {
  return [
    ReturnStatus.PENDIENTE,
    ReturnStatus.APROBADA,
    ReturnStatus.COMPLETADA,
  ];
}

export function resolveEffectiveDocument(
  sale: Sale,
  returnType: ReturnType,
): EffectiveDocument {
  if (sale.dteDocumentID) {
    const storedType = sale.dteDocument?.documentType;
    if (storedType === 33 || storedType === 39) {
      return {
        requiresNce: true,
        documentType: storedType,
        codRef: resolveCodRef(returnType),
      };
    }
    return {
      requiresNce: true,
      documentType: sale.receiver?.rut ? 33 : 39,
      codRef: resolveCodRef(returnType),
    };
  }

  if (sale.saleType !== SaleType.NOTA_VENTA) {
    return {
      requiresNce: true,
      documentType: sale.saleType === SaleType.FACTURA ? 33 : 39,
      codRef: resolveCodRef(returnType),
    };
  }

  return { requiresNce: false, documentType: null, codRef: null };
}

function resolveCodRef(returnType: ReturnType): '1' | '6' | '4' {
  if (returnType === ReturnType.TOTAL) return '1';
  if (returnType === ReturnType.PARCIAL) return '6';
  return '4';
}

export function calculateAvailableQuantities(
  sale: Sale,
  activeReturns: Return[],
): Map<string, number> {
  const available = new Map<string, number>();

  for (const item of sale.items ?? []) {
    available.set(item.saleItemID, item.quantity);
  }

  for (const ret of activeReturns) {
    for (const retItem of ret.items ?? []) {
      const current = available.get(retItem.saleItemID) ?? 0;
      available.set(retItem.saleItemID, current - retItem.quantity);
    }
  }

  return available;
}

export function calculateMonetaryCap(
  sale: Sale,
  activeReturns: Return[],
): number {
  const used = activeReturns.reduce(
    (acc, ret) => acc + Number(ret.total ?? 0),
    0,
  );
  return Math.max(Number(sale.total) - used, 0);
}

function validateItemsBelongToSale(
  sale: Sale,
  requested: ReturnableItemInput[],
): void {
  const saleItemIds = new Set(
    (sale.items ?? []).map((item) => item.saleItemID),
  );
  const seen = new Set<string>();

  for (const item of requested) {
    if (!saleItemIds.has(item.saleItemID)) {
      throw new BadRequestException(
        `El ítem ${item.saleItemID} no pertenece a la venta original`,
      );
    }
    if (seen.has(item.saleItemID)) {
      throw new BadRequestException(
        `El ítem ${item.saleItemID} está duplicado en la devolución`,
      );
    }
    seen.add(item.saleItemID);
  }
}

function buildPreparedItems(
  sale: Sale,
  requested: ReturnableItemInput[],
): PreparedReturnItem[] {
  const saleItemById = new Map(
    (sale.items ?? []).map((item) => [item.saleItemID, item]),
  );

  return requested.map((item) => {
    const saleItem = saleItemById.get(item.saleItemID)!;
    return {
      saleItemID: saleItem.saleItemID,
      storeProductID: saleItem.storeProductID,
      variationID: saleItem.variationID,
      productName: saleItem.productName,
      sku: saleItem.sku,
      quantity: item.quantity,
      unitPrice: Number(saleItem.unitPrice),
      unitCost: Number(saleItem.unitCost),
      lineTotal: roundClp(Number(saleItem.unitPrice) * item.quantity),
      condition: item.condition ?? ReturnItemCondition.SELLABLE,
    };
  });
}

export function validateReturnRequest(input: {
  sale: Sale;
  storeID: string;
  returnType: ReturnType;
  items?: ReturnableItemInput[];
  discountAmount?: number;
  reason?: string;
  issueDate?: string;
  activeReturns: Return[];
}): PreparedReturn {
  const { sale, storeID, returnType } = input;

  if (sale.storeID !== storeID) {
    throw new BadRequestException(
      'La devolución debe registrarse en la tienda de la venta original',
    );
  }

  const requested = input.items ?? [];
  validateItemsBelongToSale(sale, requested);

  const available = calculateAvailableQuantities(sale, input.activeReturns);
  let preparedItems: PreparedReturnItem[] = [];

  if (returnType === ReturnType.DESCUENTO) {
    if (requested.length > 0) {
      throw new BadRequestException(
        'Una devolución de tipo DESCUENTO no incluye ítems físicos',
      );
    }
    const amount = Number(input.discountAmount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException(
        'El monto del descuento es obligatorio y debe ser mayor que cero',
      );
    }
    if (!input.reason?.trim()) {
      throw new BadRequestException(
        'El motivo es obligatorio en devoluciones de tipo DESCUENTO',
      );
    }

    const cap = calculateMonetaryCap(sale, input.activeReturns);
    if (amount > cap) {
      throw new BadRequestException(
        `El monto del descuento supera el saldo devolvible de la venta (${cap})`,
      );
    }

    const total = roundClp(amount);
    const { netTotal, taxTotal } = splitIvaIncluded(total);
    return {
      returnType,
      reason: input.reason.trim(),
      issueDate: toDateOnly(input.issueDate ?? new Date()),
      items: [],
      subtotal: 0,
      discountAmount: total,
      netTotal,
      taxTotal,
      total,
      cogsTotal: 0,
    };
  }

  if (requested.length === 0) {
    throw new BadRequestException(
      `Las devoluciones ${returnType} requieren al menos un ítem`,
    );
  }

  if (returnType === ReturnType.TOTAL) {
    for (const saleItem of sale.items ?? []) {
      const remaining = available.get(saleItem.saleItemID) ?? 0;
      const requestedQty =
        requested.find((item) => item.saleItemID === saleItem.saleItemID)
          ?.quantity ?? 0;
      if (remaining > 0 && requestedQty !== remaining) {
        throw new BadRequestException(
          `La devolución TOTAL debe incluir el saldo completo del ítem ${saleItem.saleItemID} (${remaining})`,
        );
      }
      if (remaining <= 0 && requestedQty > 0) {
        throw new BadRequestException(
          `El ítem ${saleItem.saleItemID} ya no tiene saldo devolvible`,
        );
      }
    }
  } else {
    for (const item of requested) {
      const remaining = available.get(item.saleItemID) ?? 0;
      if (item.quantity > remaining) {
        throw new BadRequestException(
          `La cantidad devuelta del ítem ${item.saleItemID} supera su saldo devolvible (${remaining})`,
        );
      }
    }
  }

  preparedItems = buildPreparedItems(sale, requested);
  const total = roundClp(
    preparedItems.reduce((acc, item) => acc + item.lineTotal, 0),
  );
  const cogsTotal = toMoney(
    preparedItems.reduce((acc, item) => acc + item.unitCost * item.quantity, 0),
  );
  const { netTotal, taxTotal } = splitIvaIncluded(total);

  return {
    returnType,
    reason: input.reason?.trim() || null,
    issueDate: toDateOnly(input.issueDate ?? new Date()),
    items: preparedItems,
    subtotal: 0,
    discountAmount: 0,
    netTotal,
    taxTotal,
    total,
    cogsTotal,
  };
}
