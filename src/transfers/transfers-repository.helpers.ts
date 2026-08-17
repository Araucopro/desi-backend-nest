import { NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { InventoryMovementReason } from '../inventory/entities/inventory-movement.entity';
import { applyInventoryMovement } from '../inventory/inventory-repository.helpers';
import { TenantContextService } from '../multitenant/tenant-context.service';
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
  const tenantID = plan.tenantID ?? tenantContext?.getTenantId();

  for (const item of plan.items) {
    const { variationID, quantity } = item;

    await applyInventoryMovement(manager, {
      storeID: plan.originStoreID,
      variationID,
      reason: InventoryMovementReason.TRANSFER_OUT,
      quantity,
      referenceID: plan.transferID,
      tenantID,
      allowNegativeStock: false,
      createIfMissing: false,
    });

    await applyInventoryMovement(manager, {
      storeID: plan.destinationStoreID,
      variationID,
      reason: InventoryMovementReason.TRANSFER_IN,
      quantity,
      referenceID: plan.transferID,
      tenantID,
      allowNegativeStock: true,
      createIfMissing: true,
      priceCost: 0,
      priceList: 0,
    });
  }
}
