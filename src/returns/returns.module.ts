import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReturnsController } from './returns.controller';
import { ReturnsService } from './returns.service';
import { ReturnDteMapperService } from './return-dte-mapper.service';
import { Return } from './entities/return.entity';
import { ReturnItem } from './entities/return-item.entity';
import { ReturnFolioCounter } from './entities/return-folio-counter.entity';
import { Sale } from '../sales/entities/sale.entity';
import { SaleItem } from '../sales/entities/sale-item.entity';
import { Store } from '../stores/entities/store.entity';
import { DteDocument } from '../dte/entities/dte-document.entity';
import { DteModule } from '../dte/dte.module';
import { InventoryModule } from '../inventory/inventory.module';
import { FinancialMovementsModule } from '../financial-movements/financial-movements.module';
import { MultitenantModule } from '../multitenant/multitenant.module';
import { TransactionRunnerService } from '../common/services/transaction-runner.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Return,
      ReturnItem,
      ReturnFolioCounter,
      Sale,
      SaleItem,
      Store,
      DteDocument,
    ]),
    MultitenantModule,
    DteModule,
    InventoryModule,
    FinancialMovementsModule,
    AuthModule,
  ],
  controllers: [ReturnsController],
  providers: [ReturnsService, ReturnDteMapperService, TransactionRunnerService],
  exports: [ReturnsService],
})
export class ReturnsModule {}
