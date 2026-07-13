import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StoreProductService } from './storeproduct.service';
import { StoreProductController } from './storeproduct.controller';
import { StoreProduct } from './entities/storeproduct.entity';
import { ProductVariation } from '../../products/entities/product-variation.entity';
import { Store } from '../../stores/entities/store.entity';
import { Product } from '../../products/entities/product.entity';
import { PricingModule } from '../../pricing/pricing.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([StoreProduct, ProductVariation, Store, Product]),
    PricingModule,
  ],
  controllers: [StoreProductController],
  providers: [StoreProductService],
})
export class StoreProductModule {}
