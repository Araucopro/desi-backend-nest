import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DteController } from './dte.controller';
import { DteService } from './dte.service';
import { OpenfacturaClientService } from './openfactura-client.service';
import { DteDocument } from './entities/dte-document.entity';
import { Store } from '../stores/entities/store.entity';
import { Product } from '../products/entities/product.entity';
import { ProductVariation } from '../products/entities/product-variation.entity';
import { StoreProduct } from '../relations/storeproduct/entities/storeproduct.entity';
import { InventoryMovement } from '../inventory/entities/inventory-movement.entity';
import { PurchaseOrder } from '../purchase-orders/entities/purchase-order.entity';
import { MultitenantModule } from '../multitenant/multitenant.module';
import { UserstoresModule } from '../relations/userstores/userstores.module';
import { FinancialMovementsModule } from '../financial-movements/financial-movements.module';
import { TransactionRunnerService } from '../common/services/transaction-runner.service';

@Module({
  imports: [
    ConfigModule,
    MultitenantModule,
    UserstoresModule,
    FinancialMovementsModule,
    TypeOrmModule.forFeature([
      DteDocument,
      Store,
      Product,
      ProductVariation,
      StoreProduct,
      InventoryMovement,
      PurchaseOrder,
    ]),
  ],
  controllers: [DteController],
  providers: [DteService, OpenfacturaClientService, TransactionRunnerService],
  exports: [DteService, OpenfacturaClientService],
})
export class DteModule {}
