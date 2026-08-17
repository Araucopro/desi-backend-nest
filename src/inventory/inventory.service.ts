import { Injectable, Optional } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { InventoryMovement } from './entities/inventory-movement.entity';
import { InventoryMovementReason } from './entities/inventory-movement.entity';
import { CreateInventoryMovementDto } from './dto/create-inventory-movement.dto';
import { StoreProduct } from '../relations/storeproduct/entities/storeproduct.entity';
import { TenantContextService } from '../multitenant/tenant-context.service';
import { TransactionRunnerService } from '../common/services/transaction-runner.service';
import { applyInventoryMovement } from './inventory-repository.helpers';

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
      const { movement } = await applyInventoryMovement(manager, {
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
}
