import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { StoreTransfer, TransferStatus } from './entities/store-transfer.entity';
import { StoreTransferItem } from './entities/store-transfer-item.entity';
import { TransfersService } from './transfers.service';
import {
  InventoryMovement,
  InventoryMovementReason,
} from '../inventory/entities/inventory-movement.entity';
import { StoreProduct } from '../relations/storeproduct/entities/storeproduct.entity';

describe('TransfersService', () => {
  let service: TransfersService;

  const mockDataSource = {
    transaction: jest.fn(),
  };

  const mockManager = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    getRepository: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockManager.create.mockImplementation(
      (_entity: unknown, values: unknown) => ({ ...(values as object) }),
    );
    mockManager.save.mockImplementation(async (entity: unknown) => entity);
    mockManager.getRepository.mockReturnValue({
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
    });

    mockDataSource.transaction.mockImplementation(
      async (callback: (manager: typeof mockManager) => Promise<unknown>) =>
        callback(mockManager),
    );

    service = new TransfersService(mockDataSource as unknown as DataSource);
  });

  describe('createTransfer', () => {
    it('rejects transfers with the same origin and destination store', async () => {
      await expect(
        service.createTransfer({
          originStoreID: 'store-a',
          destinationStoreID: 'store-a',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockDataSource.transaction).not.toHaveBeenCalled();
    });

    it('creates a pending transfer inside a transaction', async () => {
      mockManager.save.mockResolvedValue({ transferID: 'transfer-1' });

      const result = await service.createTransfer({
        originStoreID: 'store-a',
        destinationStoreID: 'store-b',
      });

      expect(mockManager.create).toHaveBeenCalledWith(
        StoreTransfer,
        expect.objectContaining({
          originStore: { storeID: 'store-a' },
          destinationStore: { storeID: 'store-b' },
          status: TransferStatus.PENDING,
        }),
      );
      expect(result).toEqual({ transferID: 'transfer-1' });
    });
  });

  describe('addItem', () => {
    it('rejects adding items to a non-pending transfer', async () => {
      mockManager.findOne.mockResolvedValue({
        transferID: 'transfer-1',
        status: TransferStatus.COMPLETED,
      });

      await expect(
        service.addItem('transfer-1', {
          variationID: 'var-1',
          quantity: 2,
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockManager.create).not.toHaveBeenCalled();
      expect(mockManager.save).not.toHaveBeenCalled();
    });
  });

  describe('completeTransfer', () => {
    const transfer: Partial<StoreTransfer> = {
      transferID: 'transfer-1',
      tenantID: 'tenant-1',
      originStore: { storeID: 'store-a' } as StoreTransfer['originStore'],
      destinationStore: {
        storeID: 'store-b',
      } as StoreTransfer['destinationStore'],
      status: TransferStatus.PENDING,
    };

    const items = [
      {
        variation: { variationID: 'var-1' } as StoreTransferItem['variation'],
        quantity: 2,
      },
      {
        variation: { variationID: 'var-2' } as StoreTransferItem['variation'],
        quantity: 3,
      },
    ] as StoreTransferItem[];

    beforeEach(() => {
      transfer.status = TransferStatus.PENDING;
      transfer.completedAt = undefined;
    });

    function mockStoreProducts(
      products: Array<Partial<StoreProduct> | null>,
    ) {
      let index = 0;
      mockManager.findOne.mockImplementation(async (entity: unknown) => {
        if (entity === StoreTransfer) {
          return transfer;
        }
        if (entity === StoreProduct) {
          return products[index++] ?? null;
        }
        return undefined;
      });
    }

    it('throws 400 and creates no movements when origin stock is insufficient', async () => {
      mockManager.find.mockResolvedValue([items[0]]);
      mockStoreProducts([{ storeProductID: 'origin-1', stock: 1 }]);

      await expect(service.completeTransfer('transfer-1')).rejects.toThrow(
        BadRequestException,
      );

      expect(mockManager.create).not.toHaveBeenCalled();
      expect(mockManager.save).not.toHaveBeenCalled();
    });

    it('moves stock and registers transfer movements atomically', async () => {
      mockManager.find.mockResolvedValue(items);
      mockStoreProducts([
        { storeProductID: 'origin-1', tenantID: 'tenant-1', stock: 10 },
        { storeProductID: 'destination-1', tenantID: 'tenant-1', stock: 4 },
        { storeProductID: 'origin-2', tenantID: 'tenant-1', stock: 5 },
        { storeProductID: 'destination-2', tenantID: 'tenant-1', stock: 1 },
      ]);

      await service.completeTransfer('transfer-1');

      const movementCalls = mockManager.create.mock.calls.filter(
        ([entity]) => entity === InventoryMovement,
      );
      expect(movementCalls).toHaveLength(4);

      expect(movementCalls[0][1]).toEqual(
        expect.objectContaining({
          tenantID: 'tenant-1',
          store: { storeID: 'store-a' },
          variation: { variationID: 'var-1' },
          delta: -2,
          reason: InventoryMovementReason.TRANSFER_OUT,
          referenceID: 'transfer-1',
        }),
      );
      expect(movementCalls[1][1]).toEqual(
        expect.objectContaining({
          tenantID: 'tenant-1',
          store: { storeID: 'store-b' },
          variation: { variationID: 'var-1' },
          delta: 2,
          reason: InventoryMovementReason.TRANSFER_IN,
          referenceID: 'transfer-1',
        }),
      );
      expect(movementCalls[2][1]).toEqual(
        expect.objectContaining({
          tenantID: 'tenant-1',
          store: { storeID: 'store-a' },
          variation: { variationID: 'var-2' },
          delta: -3,
          reason: InventoryMovementReason.TRANSFER_OUT,
          referenceID: 'transfer-1',
        }),
      );
      expect(movementCalls[3][1]).toEqual(
        expect.objectContaining({
          tenantID: 'tenant-1',
          store: { storeID: 'store-b' },
          variation: { variationID: 'var-2' },
          delta: 3,
          reason: InventoryMovementReason.TRANSFER_IN,
          referenceID: 'transfer-1',
        }),
      );

      expect(mockManager.save).toHaveBeenCalledWith(
        expect.objectContaining({
          storeProductID: 'origin-1',
          stock: 8,
        }),
      );
      expect(mockManager.save).toHaveBeenCalledWith(
        expect.objectContaining({
          storeProductID: 'destination-1',
          stock: 6,
        }),
      );
      expect(mockManager.save).toHaveBeenCalledWith(
        expect.objectContaining({
          storeProductID: 'origin-2',
          stock: 2,
        }),
      );
      expect(mockManager.save).toHaveBeenCalledWith(
        expect.objectContaining({
          storeProductID: 'destination-2',
          stock: 4,
        }),
      );
      expect(mockManager.save).toHaveBeenCalledWith(
        expect.objectContaining({
          transferID: 'transfer-1',
          status: TransferStatus.COMPLETED,
          completedAt: expect.any(Date),
        }),
      );
    });

    it('creates the destination StoreProduct when it does not exist', async () => {
      mockManager.find.mockResolvedValue([items[0]]);
      mockStoreProducts([
        { storeProductID: 'origin-1', tenantID: 'tenant-1', stock: 10 },
        null,
      ]);

      await service.completeTransfer('transfer-1');

      expect(mockManager.create).toHaveBeenCalledWith(
        StoreProduct,
        expect.objectContaining({
          tenantID: 'tenant-1',
          store: { storeID: 'store-b' },
          variation: { variationID: 'var-1' },
          stock: 2,
          priceCost: 0,
          priceList: 0,
        }),
      );
      expect(mockManager.save).toHaveBeenCalledWith(
        expect.objectContaining({
          store: { storeID: 'store-b' },
          variation: { variationID: 'var-1' },
          stock: 2,
          priceCost: 0,
          priceList: 0,
        }),
      );
    });
  });
});
