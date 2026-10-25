import { Module } from '@nestjs/common';
import { SalesModule } from '../sales/sales.module';
import { CommerceOrder } from './entities/commerce-order.entity';
import { CommerceSalesService } from './commerce-sales.service';
import { CommerceSalesController } from './commerce-sales.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MultitenantModule } from '../multitenant/multitenant.module';
import { PricingModule } from '../pricing/pricing.module';
import { StoreProductModule } from '../relations/storeproduct/storeproduct.module';
import { StoreProduct } from '../relations/storeproduct/entities/storeproduct.entity';
import { Store } from '../stores/entities/store.entity';
import { Tenant } from '../multitenant/entities/tenant.entity';
import { CommerceChannel } from './entities/commerce-channel.entity';
import { CommerceController } from './commerce.controller';
import { CommerceService } from './commerce.service';
import { MasterCommerceController } from './master-commerce.controller';
import { MasterCommerceService } from './master-commerce.service';

@Module({
  imports: [
    MultitenantModule,
    SalesModule,
    PricingModule,
    StoreProductModule,
    TypeOrmModule.forFeature([
      Store,
      StoreProduct,
      Tenant,
      CommerceChannel,
      CommerceOrder,
    ]),
  ],
  controllers: [
    CommerceController,
    MasterCommerceController,
    CommerceSalesController,
  ],
  providers: [CommerceService, MasterCommerceService, CommerceSalesService],
})
export class CommerceModule {}
