import { BadRequestException } from '@nestjs/common';
import {
  StoreTransfer,
  TransferStatus,
} from './entities/store-transfer.entity';
import { StoreTransferItem } from './entities/store-transfer-item.entity';
import {
  buildTransferCompletionPlan,
  ensureDifferentStores,
  ensureTransferModifiable,
} from './transfers-engine';

function makeTransfer(overrides: Partial<StoreTransfer> = {}): StoreTransfer {
  return {
    transferID: 'transfer-1',
    tenantID: 'tenant-1',
    originStore: { storeID: 'store-a' } as StoreTransfer['originStore'],
    destinationStore: {
      storeID: 'store-b',
    } as StoreTransfer['destinationStore'],
    status: TransferStatus.PENDING,
    items: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as StoreTransfer;
}

function makeItem(variationID: string, quantity: number): StoreTransferItem {
  return {
    variation: { variationID } as StoreTransferItem['variation'],
    quantity,
  } as StoreTransferItem;
}

describe('TransfersEngine', () => {
  describe('ensureDifferentStores', () => {
    it('rejects transfers with the same origin and destination store', () => {
      expect(() => ensureDifferentStores('store-a', 'store-a')).toThrow(
        BadRequestException,
      );
    });

    it('allows different origin and destination stores', () => {
      expect(() => ensureDifferentStores('store-a', 'store-b')).not.toThrow();
    });
  });

  describe('ensureTransferModifiable', () => {
    it('rejects non-pending transfers', () => {
      expect(() => ensureTransferModifiable(TransferStatus.COMPLETED)).toThrow(
        BadRequestException,
      );
      expect(() => ensureTransferModifiable(TransferStatus.CANCELLED)).toThrow(
        BadRequestException,
      );
    });

    it('allows pending transfers', () => {
      expect(() =>
        ensureTransferModifiable(TransferStatus.PENDING),
      ).not.toThrow();
    });
  });

  describe('buildTransferCompletionPlan', () => {
    it('rejects a transfer that is not pending', () => {
      expect(() =>
        buildTransferCompletionPlan({
          transfer: makeTransfer({ status: TransferStatus.COMPLETED }),
          items: [makeItem('var-1', 2)],
        }),
      ).toThrow(BadRequestException);
    });

    it('rejects a transfer without items', () => {
      expect(() =>
        buildTransferCompletionPlan({
          transfer: makeTransfer(),
          items: [],
        }),
      ).toThrow(BadRequestException);
    });

    it('builds the completion plan from transfer and items', () => {
      const plan = buildTransferCompletionPlan({
        transfer: makeTransfer(),
        items: [makeItem('var-1', 2), makeItem('var-2', 3)],
      });

      expect(plan).toEqual({
        transferID: 'transfer-1',
        originStoreID: 'store-a',
        destinationStoreID: 'store-b',
        tenantID: 'tenant-1',
        items: [
          { variationID: 'var-1', quantity: 2 },
          { variationID: 'var-2', quantity: 3 },
        ],
      });
    });
  });
});
