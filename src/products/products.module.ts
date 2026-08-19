import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { Product } from './entities/product.entity';
import { ProductVariation } from './entities/product-variation.entity';
import { StoreProduct } from '../relations/storeproduct/entities/storeproduct.entity';
import { InventoryMovement } from '../inventory/entities/inventory-movement.entity';
import { InventoryModule } from '../inventory/inventory.module';
import { PricingModule } from '../pricing/pricing.module';
import { MultitenantModule } from '../multitenant/multitenant.module';
import { TransactionRunnerService } from '../common/services/transaction-runner.service';

@Module({
  imports: [
    MultitenantModule,
    TypeOrmModule.forFeature([
      Product,
      ProductVariation,
      StoreProduct,
      InventoryMovement,
    ]),
    PricingModule,
    InventoryModule,
  ],
  controllers: [ProductsController],
  providers: [ProductsService, TransactionRunnerService],
})
export class ProductsModule {}
