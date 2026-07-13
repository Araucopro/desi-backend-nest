import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PriceHistory } from './entities/price-history.entity';
import { PricingService } from './pricing.service';
import { PricingController } from './pricing.controller';
import { SpecialOffer } from './entities/special-offer.entity';
import { OfferService } from './offer.service';
import { MarginValidator } from './validators/margin.validator';
import { UserDiscountValidator } from './validators/user-discount.validator';

@Module({
  imports: [TypeOrmModule.forFeature([PriceHistory, SpecialOffer])],
  controllers: [PricingController],
  providers: [
    PricingService,
    OfferService,
    MarginValidator,
    UserDiscountValidator,
  ],
  exports: [TypeOrmModule, PricingService, OfferService],
})
export class PricingModule {}
