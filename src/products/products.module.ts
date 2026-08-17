import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { Product } from './entities/product.entity';
import { ProductVariation } from './entities/product-variation.entity';
import { PricingModule } from '../pricing/pricing.module';
import { MultitenantModule } from '../multitenant/multitenant.module';
import { TransactionRunnerService } from '../common/services/transaction-runner.service';

@Module({
  imports: [
    MultitenantModule,
    TypeOrmModule.forFeature([Product, ProductVariation]),
    PricingModule,
  ],
  controllers: [ProductsController],
  providers: [ProductsService, TransactionRunnerService],
})
export class ProductsModule {}
