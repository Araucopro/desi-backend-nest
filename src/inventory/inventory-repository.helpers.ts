import { BadRequestException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { StoreProduct } from '../relations/storeproduct/entities/storeproduct.entity';
import {
  InventoryMovement,
  InventoryMovementReason,
} from './entities/inventory-movement.entity';
import { calculateInventoryDelta } from './inventory-engine';

export type StockReservationItem = {
  variationID: string;
  QtyItem: number;
  costPrice?: number;
  costTotal?: number;
};

export type ApplyInventoryMovementInput = {
  storeID: string;
  variationID: string;
  reason: InventoryMovementReason;
  quantity?: number;
  newStock?: number;
  referenceID?: string;
  tenantID?: string;
  allowNegativeStock?: boolean;
  createIfMissing?: boolean;
  priceCost?: number;
  priceList?: number;
  skipZeroDelta?: boolean;
};

export type AppliedInventoryMovement = {
  storeProduct: StoreProduct;
  movement: InventoryMovement | null;
};

export async function findStoreProductForUpdate(
  manager: EntityManager,
  storeID: string,
  variationID: string,
): Promise<StoreProduct | null> {
  // Se usa query builder sin joins para que FOR UPDATE aplique solo a
  // StoreProduct. Filtrar por relaciones (store/variation) genera outer joins
  // y PostgreSQL rechaza el lock sobre su lado nullable.
  return manager
    .createQueryBuilder(StoreProduct, 'storeProduct')
    .where('storeProduct.storeID = :storeID', { storeID })
    .andWhere('storeProduct.variationID = :variationID', { variationID })
    .setLock('pessimistic_write')
    .getOne();
}

export async function findStoreProductByIdForUpdate(
  manager: EntityManager,
  storeProductID: string,
): Promise<StoreProduct | null> {
  const storeProduct = await manager
    .createQueryBuilder(StoreProduct, 'storeProduct')
    .where('storeProduct.storeProductID = :storeProductID', {
      storeProductID,
    })
    .setLock('pessimistic_write')
    .getOne();

  if (!storeProduct) {
    return null;
  }

  // Las relaciones se cargan después del lock para no generar outer joins
  // bloqueados.
  return manager.findOne(StoreProduct, {
    where: { storeProductID },
    relations: ['store', 'variation'],
  });
}

export type UpsertStoreProductInput = {
  storeID: string;
  variationID: string;
  tenantID?: string;
  priceCost?: number;
  priceList?: number;
  stockDelta?: number;
  reason?: InventoryMovementReason;
  quantity?: number;
  newStock?: number;
  createIfMissing?: boolean;
  allowNegativeStock?: boolean;
};

/**
 * Bloquea el StoreProduct de una tienda/variación, lo crea si es necesario y
 * aplica los valores de stock/precio indicados dentro de la misma transacción.
 */
export async function upsertStoreProduct(
  manager: EntityManager,
  input: UpsertStoreProductInput,
): Promise<{ storeProduct: StoreProduct; delta: number }> {
  const existing = await findStoreProductForUpdate(
    manager,
    input.storeID,
    input.variationID,
  );
  const availableStock = existing ? Number(existing.stock) : 0;
  const createIfMissing = input.createIfMissing ?? true;
  const delta =
    input.stockDelta ??
    (input.reason
      ? calculateInventoryDelta({
          reason: input.reason,
          currentStock: availableStock,
          quantity: input.quantity,
          newStock: input.newStock,
        })
      : 0);

  if (!existing && !createIfMissing) {
    throw new BadRequestException(
      `Stock insuficiente en tienda para VariationID: ${input.variationID}. Solicitado: ${input.quantity ?? Math.abs(delta)}, Disponible: 0`,
    );
  }

  const storeProduct =
    existing ??
    manager.create(StoreProduct, {
      store: { storeID: input.storeID },
      variation: { variationID: input.variationID },
      stock: 0,
      priceCost: input.priceCost ?? 0,
      priceList: input.priceList ?? 0,
      ...(input.tenantID ? { tenantID: input.tenantID } : {}),
    });

  if (input.priceCost !== undefined) {
    storeProduct.priceCost = input.priceCost;
  }
  if (input.priceList !== undefined) {
    storeProduct.priceList = input.priceList;
  }
  storeProduct.stock = availableStock + delta;

  if (input.allowNegativeStock !== true && Number(storeProduct.stock) < 0) {
    throw new BadRequestException(
      `Stock insuficiente en tienda para VariationID: ${input.variationID}. Solicitado: ${input.quantity ?? Math.abs(delta)}, Disponible: ${availableStock}`,
    );
  }

  return { storeProduct: await manager.save(storeProduct), delta };
}

/**
 * Camino único para mutar el cache de stock de StoreProduct: bloquea la fila,
 * calcula el delta según la razón, aplica el cambio y registra el movimiento.
 */
export async function applyInventoryMovement(
  manager: EntityManager,
  input: ApplyInventoryMovementInput,
): Promise<AppliedInventoryMovement> {
  const { storeProduct, delta } = await upsertStoreProduct(manager, {
    storeID: input.storeID,
    variationID: input.variationID,
    tenantID: input.tenantID,
    priceCost: input.priceCost,
    priceList: input.priceList,
    reason: input.reason,
    quantity: input.quantity,
    newStock: input.newStock,
    createIfMissing: input.createIfMissing ?? true,
    allowNegativeStock: input.allowNegativeStock ?? false,
  });

  if (delta === 0 && input.skipZeroDelta) {
    return { storeProduct, movement: null };
  }

  const movement = manager.create(InventoryMovement, {
    tenantID: input.tenantID ?? storeProduct.tenantID,
    store: { storeID: input.storeID },
    variation: { variationID: input.variationID },
    delta,
    reason: input.reason,
    referenceID: input.referenceID,
  });
  const savedMovement = await manager.save(movement);

  return { storeProduct, movement: savedMovement };
}

/**
 * Reserva stock de una venta/DTE: valida disponibilidad, descuenta el cache de
 * stock, registra el movimiento SALE y congela el costo (COGS) en los ítems.
 */
export async function reserveStockAndSnapshotCosts(
  manager: EntityManager,
  storeID: string,
  items: StockReservationItem[],
  referenceID: string,
  tenantID: string | undefined,
  reason: InventoryMovementReason = InventoryMovementReason.SALE,
): Promise<number> {
  let cogsTotal = 0;

  for (const item of items) {
    const storeProduct = await findStoreProductForUpdate(
      manager,
      storeID,
      item.variationID,
    );

    if (!storeProduct) {
      throw new BadRequestException(
        `Stock insuficiente en tienda para VariationID: ${item.variationID}. Solicitado: ${item.QtyItem}, Disponible: 0`,
      );
    }

    if (Number(storeProduct.stock) < item.QtyItem) {
      throw new BadRequestException(
        `Stock insuficiente en tienda para VariationID: ${item.variationID}. Solicitado: ${item.QtyItem}, Disponible: ${storeProduct.stock}`,
      );
    }

    const costPrice =
      Math.round((Number(storeProduct.priceCost ?? 0) + Number.EPSILON) * 100) /
      100;
    const costTotal =
      Math.round((costPrice * item.QtyItem + Number.EPSILON) * 100) / 100;
    item.costPrice = costPrice;
    item.costTotal = costTotal;
    cogsTotal =
      Math.round((cogsTotal + costTotal + Number.EPSILON) * 100) / 100;

    await applyInventoryMovement(manager, {
      storeID,
      variationID: item.variationID,
      reason,
      quantity: item.QtyItem,
      referenceID,
      tenantID: tenantID ?? storeProduct.tenantID,
      allowNegativeStock: false,
      createIfMissing: false,
    });
  }

  return cogsTotal;
}

/**
 * Revierte la reserva de un documento DTE en ERROR. Solo debe invocarse
 * cuando el DTE realmente reservó stock (stockReserved = true).
 */
export async function revertReservedStock(
  manager: EntityManager,
  storeID: string,
  items: Array<{ variationID: string; QtyItem: number }>,
  referenceID: string,
  tenantID: string | undefined,
  onMissingStoreProduct?: (variationID: string) => void,
): Promise<void> {
  for (const item of items) {
    const storeProduct = await findStoreProductForUpdate(
      manager,
      storeID,
      item.variationID,
    );

    if (!storeProduct) {
      onMissingStoreProduct?.(item.variationID);
      continue;
    }

    await applyInventoryMovement(manager, {
      storeID,
      variationID: item.variationID,
      reason: InventoryMovementReason.ADJUSTMENT,
      newStock: Number(storeProduct.stock) + Number(item.QtyItem),
      referenceID,
      tenantID: tenantID ?? storeProduct.tenantID,
      allowNegativeStock: true,
      createIfMissing: false,
      skipZeroDelta: true,
    });
  }
}
