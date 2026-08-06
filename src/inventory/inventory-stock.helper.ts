import { BadRequestException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { StoreProduct } from '../relations/storeproduct/entities/storeproduct.entity';
import {
  InventoryMovement,
  InventoryMovementReason,
} from './entities/inventory-movement.entity';

export type StockReservationItem = {
  variationID: string;
  QtyItem: number;
  costPrice?: number;
  costTotal?: number;
};

/**
 * Reserva stock de una venta/DTE: bloquea cada StoreProduct, valida
 * disponibilidad, descuenta el cache de stock y registra un movimiento
 * SALE con referenceID para trazabilidad. También congela el costo (COGS)
 * en los ítems para la conversión.
 */
export async function reserveStockAndSnapshotCosts(
  manager: EntityManager,
  storeID: string,
  items: StockReservationItem[],
  referenceID: string,
  tenantID: string | undefined,
): Promise<number> {
  let cogsTotal = 0;

  for (const item of items) {
    const storeProduct = await manager.findOne(StoreProduct, {
      where: {
        store: { storeID },
        variation: { variationID: item.variationID },
      },
      lock: { mode: 'pessimistic_write' },
    });

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

    const effectiveTenantID = tenantID ?? storeProduct.tenantID;
    storeProduct.stock -= item.QtyItem;
    await manager.save(storeProduct);
    await manager.save(
      manager.create(InventoryMovement, {
        tenantID: effectiveTenantID,
        store: { storeID },
        variation: { variationID: item.variationID },
        delta: -item.QtyItem,
        reason: InventoryMovementReason.SALE,
        referenceID,
      }),
    );
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
    const storeProduct = await manager.findOne(StoreProduct, {
      where: {
        store: { storeID },
        variation: { variationID: item.variationID },
      },
      lock: { mode: 'pessimistic_write' },
    });

    if (!storeProduct) {
      onMissingStoreProduct?.(item.variationID);
      continue;
    }

    const effectiveTenantID = tenantID ?? storeProduct.tenantID;
    storeProduct.stock += Number(item.QtyItem);
    await manager.save(storeProduct);
    await manager.save(
      manager.create(InventoryMovement, {
        tenantID: effectiveTenantID,
        store: { storeID },
        variation: { variationID: item.variationID },
        delta: Number(item.QtyItem),
        reason: InventoryMovementReason.ADJUSTMENT,
        referenceID,
      }),
    );
  }
}
