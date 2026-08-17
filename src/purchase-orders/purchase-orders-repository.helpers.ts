import { NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Store } from '../stores/entities/store.entity';
import { ProductVariation } from '../products/entities/product-variation.entity';
import { StoreProduct } from '../relations/storeproduct/entities/storeproduct.entity';
import {
  InventoryMovement,
  InventoryMovementReason,
} from '../inventory/entities/inventory-movement.entity';
import { TenantContextService } from '../multitenant/tenant-context.service';
import { PurchaseOrder } from './entities/purchase-order.entity';
import { PurchaseOrderItem } from './entities/purchase-order-item.entity';
import { toMoney } from './purchase-orders-engine';

export async function findStoreById(
  manager: EntityManager,
  storeID: string,
): Promise<Store> {
  const store = await manager.findOne(Store, {
    where: { storeID },
  });

  if (!store) {
    throw new NotFoundException(`Tienda con ID ${storeID} no encontrada`);
  }

  return store;
}

export async function findVariationById(
  manager: EntityManager,
  variationID: string,
): Promise<ProductVariation> {
  const variation = await manager.findOne(ProductVariation, {
    where: { variationID },
  });

  if (!variation) {
    throw new NotFoundException(
      `Variación con ID ${variationID} no encontrada`,
    );
  }

  return variation;
}

export async function findPurchaseOrderForUpdate(
  manager: EntityManager,
  purchaseOrderID: string,
): Promise<PurchaseOrder> {
  const purchaseOrder = await manager.findOne(PurchaseOrder, {
    where: { purchaseOrderID },
    lock: { mode: 'pessimistic_write' },
    relations: ['store'],
  });

  if (!purchaseOrder) {
    throw new NotFoundException(
      `Orden de compra con ID ${purchaseOrderID} no encontrada`,
    );
  }

  return purchaseOrder;
}

export async function findPurchaseOrderItems(
  manager: EntityManager,
  purchaseOrderID: string,
): Promise<PurchaseOrderItem[]> {
  return manager.find(PurchaseOrderItem, {
    where: { purchaseOrder: { purchaseOrderID } },
    relations: ['variation'],
  });
}

export function createPurchaseOrderEntity(
  manager: EntityManager,
  values: {
    storeID: string;
    folio: string;
    isThirdParty: boolean;
    issueDate: Date;
    dueDate: Date | null;
    paymentStatus: PurchaseOrder['paymentStatus'];
    status: PurchaseOrder['status'];
    discount: number;
  },
): PurchaseOrder {
  return manager.create(PurchaseOrder, {
    store: { storeID: values.storeID },
    folio: values.folio,
    isThirdParty: values.isThirdParty,
    issueDate: values.issueDate,
    dueDate: values.dueDate,
    paymentStatus: values.paymentStatus,
    status: values.status,
    subtotal: 0,
    discount: values.discount,
    netTotal: 0,
    tax: 0,
    total: 0,
    totalProducts: 0,
  });
}

export function createPurchaseOrderItemEntity(
  manager: EntityManager,
  values: {
    purchaseOrderID: string;
    variationID: string;
    unitPrice: number;
    quantityRequested: number;
    quantityReceived?: number;
  },
): PurchaseOrderItem {
  return manager.create(PurchaseOrderItem, {
    purchaseOrder: { purchaseOrderID: values.purchaseOrderID },
    variation: { variationID: values.variationID },
    unitPrice: values.unitPrice,
    quantityRequested: values.quantityRequested,
    quantityReceived: values.quantityReceived ?? 0,
    subtotal: toMoney(values.unitPrice * values.quantityRequested),
  });
}

async function upsertStoreStock(
  manager: EntityManager,
  storeID: string,
  variationID: string,
  priceCost: number,
  delta: number,
): Promise<void> {
  let storeStock = await manager.findOne(StoreProduct, {
    where: {
      store: { storeID },
      variation: { variationID },
    },
    lock: { mode: 'pessimistic_write' },
  });

  if (!storeStock) {
    storeStock = manager.create(StoreProduct, {
      store: { storeID },
      variation: { variationID },
      stock: 0,
      priceCost,
      priceList: 0,
    });
  }

  storeStock.priceCost = priceCost;
  storeStock.stock += delta;
  await manager.save(storeStock);
}

/**
 * Aplica o revierte el stock de una OC y registra la trazabilidad en
 * InventoryMovements dentro de la misma transacción.
 *
 * direction: +1 aplica stock (PURCHASE), -1 revierte (ADJUSTMENT).
 */
export async function applyStockForOrder(
  manager: EntityManager,
  order: PurchaseOrder,
  direction: 1 | -1,
  tenantContext?: TenantContextService,
): Promise<void> {
  const sign = direction === 1 ? 1 : -1;
  const reason =
    direction === 1
      ? InventoryMovementReason.PURCHASE
      : InventoryMovementReason.ADJUSTMENT;

  for (const item of order.items) {
    const quantity = item.quantityRequested || 0;
    if (quantity <= 0) continue;

    const variation = await manager.findOne(ProductVariation, {
      where: { variationID: item.variation.variationID },
      lock: { mode: 'pessimistic_write' },
    });

    if (!variation) {
      throw new NotFoundException(
        `Variación con ID ${item.variation.variationID} no encontrada`,
      );
    }

    const storeID = order.store.storeID;
    const variationID = item.variation.variationID;
    const delta = sign * quantity;
    const tenantID =
      order.tenantID ?? tenantContext?.getTenantId() ?? variation.tenantID;

    await upsertStoreStock(
      manager,
      storeID,
      variationID,
      item.unitPrice,
      delta,
    );

    await manager.save(
      manager.create(InventoryMovement, {
        tenantID,
        store: { storeID },
        variation: { variationID },
        delta,
        reason,
        referenceID: order.purchaseOrderID,
      }),
    );
  }
}
