import { BadRequestException } from '@nestjs/common';
import {
  StoreTransfer,
  TransferStatus,
} from './entities/store-transfer.entity';
import { StoreTransferItem } from './entities/store-transfer-item.entity';
import { TransferCompletionPlan } from './transfers.types';

export function ensureDifferentStores(
  originStoreID: string,
  destinationStoreID: string,
): void {
  if (originStoreID === destinationStoreID) {
    throw new BadRequestException(
      'Origin and Destination stores must be different',
    );
  }
}

export function ensureTransferModifiable(
  status: TransferStatus,
  action: 'addItem' | 'complete' = 'addItem',
): void {
  if (status !== TransferStatus.PENDING) {
    throw new BadRequestException(
      action === 'complete'
        ? 'Transfer is not pending'
        : 'Cannot add items to a non-pending transfer',
    );
  }
}

export function buildTransferCompletionPlan(input: {
  transfer: StoreTransfer;
  items: StoreTransferItem[];
}): TransferCompletionPlan {
  const { transfer, items } = input;

  ensureTransferModifiable(transfer.status, 'complete');

  if (!items || items.length === 0) {
    throw new BadRequestException('Transfer has no items');
  }

  return {
    transferID: transfer.transferID,
    originStoreID: transfer.originStore.storeID,
    destinationStoreID: transfer.destinationStore.storeID,
    tenantID: transfer.tenantID,
    items: items.map((item) => ({
      variationID: item.variation.variationID,
      quantity: item.quantity,
    })),
  };
}
