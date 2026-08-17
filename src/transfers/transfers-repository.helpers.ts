import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import {
  InventoryMovement,
  InventoryMovementReason,
} from '../inventory/entities/inventory-movement.entity';
import { TenantContextService } from '../multitenant/tenant-context.service';
import { StoreProduct } from '../relations/storeproduct/entities/storeproduct.entity';
import {
  StoreTransfer,
  TransferStatus,
} from './entities/store-transfer.entity';
import { StoreTransferItem } from './entities/store-transfer-item.entity';
import { TransferCompletionPlan } from './transfers.types';

export async function findTransferForUpdate(
  manager: EntityManager,
  transferID: string,
): Promise<StoreTransfer> {
  const transfer = await manager.findOne(StoreTransfer, {
    where: { transferID },
    relations: ['originStore', 'destinationStore'],
    lock: { mode: 'pessimistic_write' },
  });

  if (!transfer) {
    throw new NotFoundException('Transfer not found');
  }

  return transfer;
}

export async function findTransferItems(
  manager: EntityManager,
  transferID: string,
): Promise<StoreTransferItem[]> {
  return manager.find(StoreTransferItem, {
    where: { transfer: { transferID } },
    relations: ['variation'],
  });
}

export function createTransferEntity(
  manager: EntityManager,
  values: {
    originStoreID: string;
    destinationStoreID: string;
  },
): StoreTransfer {
  return manager.create(StoreTransfer, {
    originStore: { storeID: values.originStoreID },
    destinationStore: { storeID: values.destinationStoreID },
    status: TransferStatus.PENDING,
  });
}

export function createTransferItemEntity(
  manager: EntityManager,
  values: {
    transferID: string;
    variationID: string;
    quantity: number;
  },
): StoreTransferItem {
  return manager.create(StoreTransferItem, {
    transfer: { transferID: values.transferID },
    variation: { variationID: values.variationID },
    quantity: values.quantity,
  });
}

export async function applyTransferMovements(
  manager: EntityManager,
  plan: TransferCompletionPlan,
  tenantContext?: TenantContextService,
): Promise<void> {
  for (const item of plan.items) {
    const { variationID, quantity } = item;

    const originStoreProduct = await manager.findOne(StoreProduct, {
      where: {
        store: { storeID: plan.originStoreID },
        variation: { variationID },
      },
      lock: { mode: 'pessimistic_write' },
    });

    const availableStock = originStoreProduct?.stock ?? 0;
    if (!originStoreProduct || Number(availableStock) < quantity) {
      throw new BadRequestException(
        `Insufficient stock in origin store for variation ${variationID}: requested ${quantity}, available ${availableStock}`,
      );
    }

    let destinationStoreProduct = await manager.findOne(StoreProduct, {
      where: {
        store: { storeID: plan.destinationStoreID },
        variation: { variationID },
      },
      lock: { mode: 'pessimistic_write' },
    });

    const effectiveTenantID =
      plan.tenantID ??
      tenantContext?.getTenantId() ??
      originStoreProduct.tenantID;

    if (!destinationStoreProduct) {
      destinationStoreProduct = manager.create(StoreProduct, {
        tenantID: effectiveTenantID,
        store: { storeID: plan.destinationStoreID },
        variation: { variationID },
        stock: quantity,
        priceCost: 0,
        priceList: 0,
      });
    } else {
      destinationStoreProduct.stock += quantity;
    }

    originStoreProduct.stock -= quantity;

    await manager.save(originStoreProduct);
    await manager.save(destinationStoreProduct);

    await manager.save(
      manager.create(InventoryMovement, {
        tenantID: effectiveTenantID,
        store: { storeID: plan.originStoreID },
        variation: { variationID },
        delta: -Math.abs(quantity),
        reason: InventoryMovementReason.TRANSFER_OUT,
        referenceID: plan.transferID,
      }),
    );

    await manager.save(
      manager.create(InventoryMovement, {
        tenantID: effectiveTenantID,
        store: { storeID: plan.destinationStoreID },
        variation: { variationID },
        delta: Math.abs(quantity),
        reason: InventoryMovementReason.TRANSFER_IN,
        referenceID: plan.transferID,
      }),
    );
  }
}
