import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { DteMapperService } from './dte-mapper.service';
import { Sale } from './entities/sale.entity';
import { SaleItem } from './entities/sale-item.entity';
import { SaleFolioCounter } from './entities/sale-folio-counter.entity';
import { Store } from '../stores/entities/store.entity';
import { StoreProduct } from '../relations/storeproduct/entities/storeproduct.entity';
import { ProductVariation } from '../products/entities/product-variation.entity';
import { InventoryMovement } from '../inventory/entities/inventory-movement.entity';
import { MultitenantModule } from '../multitenant/multitenant.module';
import { PricingModule } from '../pricing/pricing.module';
import { FinancialMovementsModule } from '../financial-movements/financial-movements.module';
import { DteModule } from '../dte/dte.module';
import { TransactionRunnerService } from '../common/services/transaction-runner.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Sale,
      SaleItem,
      SaleFolioCounter,
      Store,
      StoreProduct,
      ProductVariation,
      InventoryMovement,
    ]),
    MultitenantModule,
    PricingModule,
    FinancialMovementsModule,
    DteModule,
  ],
  controllers: [SalesController],
  providers: [SalesService, DteMapperService, TransactionRunnerService],
  exports: [SalesService],
})
export class SalesModule {}
