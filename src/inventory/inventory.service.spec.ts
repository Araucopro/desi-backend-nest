import { BadRequestException } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { InventoryMovementReason } from './entities/inventory-movement.entity';
import { InventoryMovement } from './entities/inventory-movement.entity';
import { StoreProduct } from '../relations/storeproduct/entities/storeproduct.entity';

describe('InventoryService', () => {
  function createManagerMock(storeProduct?: Partial<StoreProduct> | null) {
    const manager = {
      findOne: jest.fn(async () => storeProduct ?? null),
      create: jest.fn((_entity: unknown, values: Record<string, unknown>) => ({
        ...values,
      })),
      save: jest.fn(async (entity: unknown) => entity),
    };
    return manager;
  }

  function createService(manager: ReturnType<typeof createManagerMock>) {
    const dataSource = {
      transaction: jest.fn(async (cb: (manager: unknown) => Promise<unknown>) =>
        cb(manager),
      ),
    };
    return new InventoryService(dataSource as any);
  }

  it('creates a StoreProduct and an ADJUSTMENT movement for a new stock', async () => {
    const manager = createManagerMock(null);
    const service = createService(manager);

    const movement = await service.createMovement({
      storeID: 'store-1',
      variationID: 'var-1',
      reason: InventoryMovementReason.ADJUSTMENT,
      newStock: 5,
    });

    expect(manager.findOne).toHaveBeenCalledWith(
      StoreProduct,
      expect.objectContaining({
        lock: { mode: 'pessimistic_write' },
      }),
    );
    expect(manager.create).toHaveBeenCalledWith(
      StoreProduct,
      expect.objectContaining({
        store: { storeID: 'store-1' },
        variation: { variationID: 'var-1' },
        stock: 0,
      }),
    );
    expect(manager.create).toHaveBeenCalledWith(
      InventoryMovement,
      expect.objectContaining({
        delta: 5,
        reason: InventoryMovementReason.ADJUSTMENT,
      }),
    );
    expect(movement).toMatchObject({
      delta: 5,
      reason: InventoryMovementReason.ADJUSTMENT,
    });
  });

  it('rejects a SALE without an existing StoreProduct', async () => {
    const manager = createManagerMock(null);
    const service = createService(manager);

    await expect(
      service.createMovement({
        storeID: 'store-1',
        variationID: 'var-1',
        reason: InventoryMovementReason.SALE,
        quantity: 2,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(manager.create).not.toHaveBeenCalled();
  });

  it('rejects a TRANSFER_OUT that leaves stock negative', async () => {
    const manager = createManagerMock({ stock: 3 });
    const service = createService(manager);

    await expect(
      service.createMovement({
        storeID: 'store-1',
        variationID: 'var-1',
        reason: InventoryMovementReason.TRANSFER_OUT,
        quantity: 5,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(manager.create).not.toHaveBeenCalled();
  });

  it('allows internal ADJUSTMENT movements to go negative', async () => {
    const manager = createManagerMock({ stock: 2 });
    const service = createService(manager);

    const movement = await service.createMovement({
      storeID: 'store-1',
      variationID: 'var-1',
      reason: InventoryMovementReason.ADJUSTMENT,
      newStock: -5,
    });

    expect(movement).toMatchObject({
      delta: -7,
      reason: InventoryMovementReason.ADJUSTMENT,
    });
  });
});
