import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SalesService } from './sales.service';
import { SalesController } from './sales.controller';
import { Sale } from './entities/sale.entity';
import { SaleProduct } from './entities/sale-product.entity';
import { ProductVariation } from '../products/entities/product-variation.entity';
import { Store } from '../stores/entities/store.entity';
import { StoreProduct } from '../relations/storeproduct/entities/storeproduct.entity';
import { InventoryMovement } from '../inventory/entities/inventory-movement.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Sale,
      SaleProduct,
      ProductVariation,
      Store,
      StoreProduct,
      InventoryMovement,
    ]),
  ],
  controllers: [SalesController],
  providers: [SalesService],
})
export class SalesModule {}
