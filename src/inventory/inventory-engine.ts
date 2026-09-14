import { BadRequestException } from '@nestjs/common';
import { InventoryMovementReason } from './entities/inventory-movement.entity';

export type InventoryDeltaInput = {
  reason: InventoryMovementReason;
  currentStock: number;
  quantity?: number;
  newStock?: number;
};

/**
 * Calcula el delta de stock para una razón de movimiento y valida que la
 * operación esté bien formada. No toca la base de datos.
 */
export function calculateInventoryDelta(input: InventoryDeltaInput): number {
  switch (input.reason) {
    case InventoryMovementReason.SALE:
    case InventoryMovementReason.TRANSFER_OUT:
    case InventoryMovementReason.DISPATCH_GUIDE:
      if (input.quantity === undefined || input.quantity <= 0) {
        throw new BadRequestException('Quantity required for this operation');
      }
      return -Math.abs(input.quantity);

    case InventoryMovementReason.PURCHASE:
    case InventoryMovementReason.TRANSFER_IN:
    case InventoryMovementReason.RETURN:
      if (input.quantity === undefined || input.quantity <= 0) {
        throw new BadRequestException('Quantity required for this operation');
      }
      return Math.abs(input.quantity);

    case InventoryMovementReason.ADJUSTMENT:
      if (input.newStock === undefined) {
        throw new BadRequestException('New Stock required for Adjustment');
      }
      return input.newStock - input.currentStock;

    default:
      throw new BadRequestException('Invalid Movement Reason');
  }
}
