import { Injectable, Optional } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { InventoryMovement } from './entities/inventory-movement.entity';
import { InventoryMovementReason } from './entities/inventory-movement.entity';
import { CreateInventoryMovementDto } from './dto/create-inventory-movement.dto';
import { StoreProduct } from '../relations/storeproduct/entities/storeproduct.entity';
import { TenantContextService } from '../multitenant/tenant-context.service';
import { TransactionRunnerService } from '../common/services/transaction-runner.service';
import {
  ApplyInventoryMovementInput,
  AppliedInventoryMovement,
  applyInventoryMovement as applyInventoryMovementHelper,
  findStoreProductByIdForUpdate as findStoreProductByIdForUpdateHelper,
  findStoreProductForUpdate as findStoreProductForUpdateHelper,
  reserveStockAndSnapshotCosts as reserveStockAndSnapshotCostsHelper,
  revertReservedStock as revertReservedStockHelper,
  StockReservationItem,
} from './inventory-repository.helpers';

@Injectable()
export class InventoryService {
  constructor(
    private readonly dataSource: DataSource,
    @Optional() private readonly tenantContext?: TenantContextService,
    @Optional() private readonly transactionRunner?: TransactionRunnerService,
  ) {}

  private runInTransaction<T>(
    callback: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    if (this.transactionRunner) {
      return this.transactionRunner.run(callback);
    }

    return this.tenantContext
      ? this.tenantContext.transaction(callback)
      : this.dataSource.transaction(callback);
  }

  async createMovement(
    createInventoryMovementDto: CreateInventoryMovementDto,
  ): Promise<InventoryMovement> {
    const { storeID, variationID, quantity, newStock, reason, referenceID } =
      createInventoryMovementDto;

    return this.runInTransaction(async (manager) => {
      const { movement } = await this.applyMovement(manager, {
        storeID,
        variationID,
        reason,
        quantity,
        newStock,
        referenceID,
        tenantID: this.tenantContext?.getTenantId(),
        allowNegativeStock:
          reason !== InventoryMovementReason.SALE &&
          reason !== InventoryMovementReason.TRANSFER_OUT,
        createIfMissing:
          reason !== InventoryMovementReason.SALE &&
          reason !== InventoryMovementReason.TRANSFER_OUT,
      });

      if (!movement) {
        throw new Error('No inventory movement was generated');
      }
      return movement;
    });
  }

  async getStoreStock(storeID: string): Promise<StoreProduct[]> {
    return this.runInTransaction((manager) =>
      manager.getRepository(StoreProduct).find({
        where: {
          store: { storeID },
        },
        relations: ['variation', 'variation.product'],
      }),
    );
  }

  async applyMovement(
    manager: EntityManager,
    input: ApplyInventoryMovementInput,
  ): Promise<AppliedInventoryMovement> {
    return applyInventoryMovementHelper(manager, input);
  }

  async reserveStock(
    manager: EntityManager,
    storeID: string,
    items: StockReservationItem[],
    referenceID: string,
    tenantID: string | undefined,
    reason: InventoryMovementReason = InventoryMovementReason.SALE,
  ): Promise<number> {
    return reserveStockAndSnapshotCostsHelper(
      manager,
      storeID,
      items,
      referenceID,
      tenantID,
      reason,
    );
  }

  async revertReservedStock(
    manager: EntityManager,
    storeID: string,
    items: Array<{ variationID: string; QtyItem: number }>,
    referenceID: string,
    tenantID: string | undefined,
    onMissingStoreProduct?: (variationID: string) => void,
  ): Promise<void> {
    return revertReservedStockHelper(
      manager,
      storeID,
      items,
      referenceID,
      tenantID,
      onMissingStoreProduct,
    );
  }

  async findStoreProductForUpdate(
    manager: EntityManager,
    storeID: string,
    variationID: string,
  ): Promise<StoreProduct | null> {
    return findStoreProductForUpdateHelper(manager, storeID, variationID);
  }

  async findStoreProductByIdForUpdate(
    manager: EntityManager,
    storeProductID: string,
  ): Promise<StoreProduct | null> {
    return findStoreProductByIdForUpdateHelper(manager, storeProductID);
  }
}
