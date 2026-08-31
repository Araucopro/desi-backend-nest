import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DispatchGuidesController } from './dispatch-guides.controller';
import { DispatchGuidesService } from './dispatch-guides.service';
import { DispatchGuideDteMapperService } from './dispatch-guide-dte-mapper.service';
import { DispatchGuide } from './entities/dispatch-guide.entity';
import { DispatchGuideItem } from './entities/dispatch-guide-item.entity';
import { DispatchGuideReference } from './entities/dispatch-guide-reference.entity';
import { DispatchGuideReferenceItem } from './entities/dispatch-guide-reference-item.entity';
import { Store } from '../stores/entities/store.entity';
import { StoreProduct } from '../relations/storeproduct/entities/storeproduct.entity';
import { ProductVariation } from '../products/entities/product-variation.entity';
import { MultitenantModule } from '../multitenant/multitenant.module';
import { StoresModule } from '../stores/stores.module';
import { PricingModule } from '../pricing/pricing.module';
import { DteModule } from '../dte/dte.module';
import { InventoryModule } from '../inventory/inventory.module';
import { TransactionRunnerService } from '../common/services/transaction-runner.service';
import { AuthModule } from '../auth/auth.module';
import { ClientsModule } from '../clients/clients.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DispatchGuide,
      DispatchGuideItem,
      DispatchGuideReference,
      DispatchGuideReferenceItem,
      Store,
      StoreProduct,
      ProductVariation,
    ]),
    MultitenantModule,
    StoresModule,
    PricingModule,
    DteModule,
    InventoryModule,
    AuthModule,
    ClientsModule,
  ],
  controllers: [DispatchGuidesController],
  providers: [
    DispatchGuidesService,
    DispatchGuideDteMapperService,
    TransactionRunnerService,
  ],
  exports: [DispatchGuidesService],
})
export class DispatchGuidesModule {}
