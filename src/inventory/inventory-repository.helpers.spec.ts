import { StoreProduct } from '../relations/storeproduct/entities/storeproduct.entity';
import { InventoryMovement } from './entities/inventory-movement.entity';
import { InventoryMovementReason } from './entities/inventory-movement.entity';
import { ReturnItemCondition } from '../returns/entities/return-item.entity';
import { applyInventoryMovement } from './inventory-repository.helpers';

function createMockManager(existing: Partial<StoreProduct> | null = null) {
  let storeProductState: Partial<StoreProduct> | null = existing
    ? { ...existing }
    : null;

  return {
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      setLock: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockImplementation(async () => storeProductState),
    })),
    create: jest.fn((_entity: unknown, values: object) => ({ ...values })),
    save: jest.fn(async (entity: unknown) => {
      const record = entity as Record<string, unknown>;
      if (record.storeProductID || record.variation) {
        storeProductState = { ...storeProductState, ...record };
      }
      return entity;
    }),
  };
}

describe('applyInventoryMovement', () => {
  it('aplica RETURN DEFECTIVE a stockDefective y deja stock intacto', async () => {
    const manager = createMockManager({
      storeProductID: 'sp-1',
      tenantID: 'tenant-1',
      store: { storeID: 'store-1' } as any,
      variation: { variationID: 'var-1' } as any,
      stock: 5,
      stockDefective: 0,
    });

    const result = await applyInventoryMovement(manager as any, {
      storeID: 'store-1',
      variationID: 'var-1',
      reason: InventoryMovementReason.RETURN,
      quantity: 2,
      tenantID: 'tenant-1',
      condition: ReturnItemCondition.DEFECTIVE,
    });

    expect(result.storeProduct.stock).toBe(5);
    expect(result.storeProduct.stockDefective).toBe(2);
    expect(result.movement).toMatchObject({
      delta: 2,
      reason: InventoryMovementReason.RETURN,
      condition: ReturnItemCondition.DEFECTIVE,
    });
  });

  it('aplica RETURN SELLABLE (o sin condition) a stock normal', async () => {
    const manager = createMockManager({
      storeProductID: 'sp-1',
      tenantID: 'tenant-1',
      store: { storeID: 'store-1' } as any,
      variation: { variationID: 'var-1' } as any,
      stock: 5,
      stockDefective: 0,
    });

    const result = await applyInventoryMovement(manager as any, {
      storeID: 'store-1',
      variationID: 'var-1',
      reason: InventoryMovementReason.RETURN,
      quantity: 3,
      tenantID: 'tenant-1',
      condition: ReturnItemCondition.SELLABLE,
    });

    expect(result.storeProduct.stock).toBe(8);
    expect(result.storeProduct.stockDefective).toBe(0);
    expect(result.movement).toMatchObject({
      delta: 3,
      condition: ReturnItemCondition.SELLABLE,
    });
  });

  it('crea StoreProduct con stockDefective 0 cuando no existe la fila', async () => {
    const manager = createMockManager(null);

    const result = await applyInventoryMovement(manager as any, {
      storeID: 'store-1',
      variationID: 'var-1',
      reason: InventoryMovementReason.RETURN,
      quantity: 1,
      tenantID: 'tenant-1',
      createIfMissing: true,
      condition: ReturnItemCondition.DEFECTIVE,
    });

    expect(result.storeProduct).toMatchObject({
      stock: 0,
      stockDefective: 1,
    });
    expect(manager.create).toHaveBeenCalledWith(
      InventoryMovement,
      expect.objectContaining({ condition: ReturnItemCondition.DEFECTIVE }),
    );
  });
});
