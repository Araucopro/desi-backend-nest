import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PurchaseOrdersService } from './purchase-orders.service';
import { PurchaseOrdersController } from './purchase-orders.controller';
import { PurchaseOrder } from './entities/purchase-order.entity';
import { PurchaseOrderItem } from './entities/purchase-order-item.entity';
import { ProductVariation } from '../products/entities/product-variation.entity';
import { Store } from '../stores/entities/store.entity';
import { StoreProduct } from '../relations/storeproduct/entities/storeproduct.entity';
import { InventoryMovement } from '../inventory/entities/inventory-movement.entity';
import { MultitenantModule } from '../multitenant/multitenant.module';
import { FinancialMovementsModule } from '../financial-movements/financial-movements.module';
import { TransactionRunnerService } from '../common/services/transaction-runner.service';

@Module({
  imports: [
    MultitenantModule,
    FinancialMovementsModule,
    TypeOrmModule.forFeature([
      PurchaseOrder,
      PurchaseOrderItem,
      ProductVariation,
      Store,
      StoreProduct,
      InventoryMovement,
    ]),
  ],
  controllers: [PurchaseOrdersController],
  providers: [PurchaseOrdersService, TransactionRunnerService],
})
export class PurchaseOrdersModule {}
