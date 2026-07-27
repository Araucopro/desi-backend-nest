import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PurchaseOrdersService } from './purchase-orders.service';
import { PurchaseOrdersController } from './purchase-orders.controller';
import { PurchaseOrder } from './entities/purchase-order.entity';
import { PurchaseOrderItem } from './entities/purchase-order-item.entity';
import { ProductVariation } from '../products/entities/product-variation.entity';
import { Store } from '../stores/entities/store.entity';
import { StoreProduct } from '../relations/storeproduct/entities/storeproduct.entity';
import { MultitenantModule } from '../multitenant/multitenant.module';

@Module({
  imports: [
    MultitenantModule,
    TypeOrmModule.forFeature([
      PurchaseOrder,
      PurchaseOrderItem,
      ProductVariation,
      Store,
      StoreProduct,
    ]),
  ],
  controllers: [PurchaseOrdersController],
  providers: [PurchaseOrdersService],
})
export class PurchaseOrdersModule {}
