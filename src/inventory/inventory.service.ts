import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import {
  InventoryMovement,
  InventoryMovementReason,
} from './entities/inventory-movement.entity';
import { CreateInventoryMovementDto } from './dto/create-inventory-movement.dto';
import { StoreProduct } from '../relations/storeproduct/entities/storeproduct.entity';
import { TenantContextService } from '../multitenant/tenant-context.service';

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(InventoryMovement)
    private readonly dataSource: DataSource,
    @Optional() private readonly tenantContext?: TenantContextService,
  ) {}

  private runInTransaction<T>(
    callback: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return this.tenantContext
      ? this.tenantContext.transaction(callback)
      : this.dataSource.transaction(callback);
  }

  async createMovement(
    createInventoryMovementDto: CreateInventoryMovementDto,
  ): Promise<InventoryMovement> {
    const { storeID, variationID, quantity, newStock, reason } =
      createInventoryMovementDto;

    return this.runInTransaction(async (manager) => {
      let storeProduct = await manager.findOne(StoreProduct, {
        where: {
          store: { storeID },
          variation: { variationID },
        },
      });

      const tenantID = this.tenantContext?.getTenantId();

      if (!storeProduct) {
        storeProduct = manager.create(StoreProduct, {
          store: { storeID },
          variation: { variationID },
          stock: 0,
          priceCost: 0,
          priceList: 0,
          ...(tenantID ? { tenantID } : {}),
        });
      }

      let delta = 0;
      const currentStock = storeProduct.stock;

      switch (reason) {
        case InventoryMovementReason.SALE:
        case InventoryMovementReason.TRANSFER_OUT:
          if (!quantity)
            throw new Error('Quantity required for this operation');
          delta = -Math.abs(quantity);
          break;

        case InventoryMovementReason.PURCHASE:
        case InventoryMovementReason.TRANSFER_IN:
          if (!quantity)
            throw new Error('Quantity required for this operation');
          delta = Math.abs(quantity);
          break;

        case InventoryMovementReason.ADJUSTMENT:
          if (newStock === undefined)
            throw new Error('New Stock required for Adjustment');
          delta = newStock - currentStock;
          break;

        default:
          throw new Error('Invalid Movement Reason');
      }

      const movement = manager.create(InventoryMovement, {
        ...(tenantID ? { tenantID } : {}),
        store: { storeID },
        variation: { variationID },
        reason,
        delta,
        referenceID: createInventoryMovementDto.referenceID,
      });
      const savedMovement = await manager.save(movement);

      storeProduct.stock += delta;
      await manager.save(storeProduct);

      return savedMovement;
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
