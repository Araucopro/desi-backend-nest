import { BadRequestException } from '@nestjs/common';
import { calculateInventoryDelta } from './inventory-engine';
import { InventoryMovementReason } from './entities/inventory-movement.entity';

describe('inventory-engine', () => {
  it('calculates negative deltas for SALE and TRANSFER_OUT', () => {
    expect(
      calculateInventoryDelta({
        reason: InventoryMovementReason.SALE,
        currentStock: 10,
        quantity: 3,
      }),
    ).toBe(-3);
    expect(
      calculateInventoryDelta({
        reason: InventoryMovementReason.TRANSFER_OUT,
        currentStock: 10,
        quantity: 5,
      }),
    ).toBe(-5);
  });

  it('calculates positive deltas for PURCHASE and TRANSFER_IN', () => {
    expect(
      calculateInventoryDelta({
        reason: InventoryMovementReason.PURCHASE,
        currentStock: 10,
        quantity: 7,
      }),
    ).toBe(7);
    expect(
      calculateInventoryDelta({
        reason: InventoryMovementReason.TRANSFER_IN,
        currentStock: 10,
        quantity: 2,
      }),
    ).toBe(2);
    expect(
      calculateInventoryDelta({
        reason: InventoryMovementReason.RETURN,
        currentStock: 10,
        quantity: 3,
      }),
    ).toBe(3);
  });

  it('calculates ADJUSTMENT as newStock minus currentStock', () => {
    expect(
      calculateInventoryDelta({
        reason: InventoryMovementReason.ADJUSTMENT,
        currentStock: 4,
        newStock: 10,
      }),
    ).toBe(6);
    expect(
      calculateInventoryDelta({
        reason: InventoryMovementReason.ADJUSTMENT,
        currentStock: 4,
        newStock: -2,
      }),
    ).toBe(-6);
  });

  it('rejects missing quantity for sale/transfer reasons', () => {
    expect(() =>
      calculateInventoryDelta({
        reason: InventoryMovementReason.SALE,
        currentStock: 10,
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      calculateInventoryDelta({
        reason: InventoryMovementReason.TRANSFER_OUT,
        currentStock: 10,
        quantity: 0,
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects invalid reasons and adjustments without newStock', () => {
    expect(() =>
      calculateInventoryDelta({
        reason: 'UNKNOWN' as InventoryMovementReason,
        currentStock: 10,
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      calculateInventoryDelta({
        reason: InventoryMovementReason.ADJUSTMENT,
        currentStock: 10,
      }),
    ).toThrow(BadRequestException);
  });
});
