import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, SelectQueryBuilder } from 'typeorm';
import { PriceHistory, PriceType } from './entities/price-history.entity';
import { UpdatePriceDto } from './dto/update-price.dto';
import { StoreProduct } from '../relations/storeproduct/entities/storeproduct.entity';
import { DiscountType, DiscountScope } from './entities/special-offer.entity';
import {
  AppliedDiscount,
  PricingInput,
  PricingResult,
} from './dto/pricing.dto';
import { OfferService } from './offer.service';
import { MarginValidator } from './validators/margin.validator';
import { UserDiscountValidator } from './validators/user-discount.validator';
import { PricingListQueryDto } from './dto/pricing-list.query.dto';

@Injectable()
export class PricingService {
  constructor(
    @InjectRepository(PriceHistory)
    private readonly priceHistoryRepository: Repository<PriceHistory>,
    private readonly dataSource: DataSource,
    private readonly offerService: OfferService,
    private readonly marginValidator: MarginValidator,
    private readonly userDiscountValidator: UserDiscountValidator,
  ) {}

  async updatePrice(updatePriceDto: UpdatePriceDto): Promise<PriceHistory> {
    const { storeID, variationID, priceType, newPrice, reason, changedBy } =
      updatePriceDto;

    return this.dataSource.transaction(async (manager) => {
      let storeProduct = await manager.findOne(StoreProduct, {
        where: {
          store: { storeID },
          variation: { variationID },
        },
      });

      if (!storeProduct) {
        storeProduct = manager.create(StoreProduct, {
          store: { storeID },
          variation: { variationID },
          stock: 0,
          priceCost: 0,
          priceList: 0,
        });
      }

      const oldPrice =
        priceType === PriceType.COST
          ? storeProduct.priceCost
          : (storeProduct.priceList ?? 0);

      const history = manager.create(PriceHistory, {
        storeProduct,
        priceType,
        oldPrice,
        newPrice,
        reason,
        changedBy,
      });
      const savedHistory = await manager.save(history);

      if (priceType === PriceType.COST) {
        storeProduct.priceCost = newPrice;
      } else {
        storeProduct.priceList = newPrice;
      }
      await manager.save(storeProduct);

      return savedHistory;
    });
  }

  async getPriceHistory(storeID: string, variationID: string) {
    return this.getPriceHistoryList({ storeID, variationID });
  }

  async getPriceHistoryList(
    filters: PricingListQueryDto = {},
  ): Promise<PriceHistory[]> {
    const query: SelectQueryBuilder<PriceHistory> = this.priceHistoryRepository
      .createQueryBuilder('history')
      .leftJoinAndSelect('history.storeProduct', 'storeProduct')
      .leftJoinAndSelect('storeProduct.store', 'store')
      .leftJoinAndSelect('storeProduct.variation', 'variation')
      .leftJoinAndSelect('variation.product', 'product')
      .orderBy('history.effectiveDate', 'DESC');

    if (filters.storeProductID) {
      query.andWhere('storeProduct.storeProductID = :storeProductID', {
        storeProductID: filters.storeProductID,
      });
    }

    if (filters.storeID) {
      query.andWhere('store.storeID = :storeID', {
        storeID: filters.storeID,
      });
    }

    if (filters.variationID) {
      query.andWhere('variation.variationID = :variationID', {
        variationID: filters.variationID,
      });
    }

    return query.getMany();
  }

  async calculatePrice(input: PricingInput): Promise<PricingResult> {
    const {
      storeProductID,
      quantity = 1,
      userID = null,
      manualDiscount,
      baseUnitPrice,
      priceCost,
    } = input;

    if (!quantity || quantity <= 0) {
      throw new BadRequestException('Quantity must be greater than zero');
    }
    if (
      manualDiscount !== undefined &&
      (typeof manualDiscount !== 'number' ||
        manualDiscount < 0 ||
        manualDiscount > 100)
    ) {
      throw new BadRequestException(
        'manualDiscount must be a number between 0 and 100',
      );
    }

    const pricingDate =
      input.pricingDate instanceof Date
        ? input.pricingDate
        : input.pricingDate
          ? new Date(input.pricingDate)
          : new Date();

    if (Number.isNaN(pricingDate.getTime())) {
      throw new BadRequestException('pricingDate must be a valid date');
    }

    let storeProduct: StoreProduct | null = null;
    const shouldLoadStoreProduct =
      baseUnitPrice === undefined ||
      priceCost === undefined ||
      manualDiscount !== undefined;

    if (shouldLoadStoreProduct) {
      storeProduct = await this.dataSource.manager.findOne(StoreProduct, {
        where: { storeProductID },
        relations: ['store', 'variation', 'variation.product'],
      });
      if (!storeProduct) {
        throw new NotFoundException('Producto de tienda no encontrado');
      }
    }

    const { unitPrice, unitCost } = await this.resolveBasePricing({
      storeProduct,
      baseUnitPrice,
      priceCost,
    });

    const basePrice = unitPrice * quantity;
    let price = basePrice;
    const pricingContext: PricingResult['pricingContext'] = {
      pricingDate: pricingDate.toISOString(),
      storeID: storeProduct?.store?.storeID,
      productID: storeProduct?.variation?.product?.productID,
      variationID: storeProduct?.variation?.variationID,
      storeType: storeProduct?.store?.type,
    };

    const breakdown: PricingResult['breakdown'] = [
      {
        step: 'basePrice',
        previousPrice: basePrice,
        newPrice: basePrice,
        delta: 0,
        scope: 'TOTAL',
        details: { unitPrice, quantity },
      },
    ];

    const discountsApplied: AppliedDiscount[] = [];
    const activeOffer = await this.offerService.getBestOffer(
      storeProductID,
      unitPrice,
      quantity,
      pricingDate,
    );
    let discountApplied = false;
    let discountDetails: AppliedDiscount | null = null;

    if (activeOffer) {
      const prev = price;
      let next = price;
      const scope: DiscountScope = activeOffer.scope ?? DiscountScope.UNIT;
      const currentUnitPrice = price / quantity;

      switch (activeOffer.discountType) {
        case DiscountType.PERCENTAGE:
          if (scope === DiscountScope.UNIT) {
            const unitAfter = currentUnitPrice * (1 - activeOffer.value / 100);
            next = unitAfter * quantity;
          } else {
            next = price * (1 - activeOffer.value / 100);
          }
          break;
        case DiscountType.FIXED_AMOUNT:
          if (scope === DiscountScope.UNIT) {
            const unitAfter = Math.max(0, currentUnitPrice - activeOffer.value);
            next = unitAfter * quantity;
          } else {
            next = Math.max(0, price - activeOffer.value);
          }
          break;
        case DiscountType.FIXED_PRICE:
          if (scope === DiscountScope.UNIT) {
            next = activeOffer.value * quantity;
          } else {
            next = activeOffer.value;
          }
          break;
      }

      price = next;
      discountApplied = true;
      discountDetails = {
        source: 'AUTO',
        applied: true,
        previousPrice: prev,
        resultingPrice: next,
        offerID: activeOffer.offerID,
        description: activeOffer.description,
        discountType: activeOffer.discountType,
        value: activeOffer.value,
        scope,
        exclusive: !!activeOffer.exclusive,
        priority: activeOffer.priority,
      };
      discountsApplied.push(discountDetails);

      breakdown.push({
        step: 'automaticOffer',
        previousPrice: prev,
        newPrice: next,
        delta: next - prev,
        scope,
        details: {
          offerID: activeOffer.offerID,
          type: activeOffer.discountType,
          value: activeOffer.value,
          priority: activeOffer.priority,
        },
      });
    }

    if (manualDiscount !== undefined && manualDiscount !== null) {
      if (discountDetails?.exclusive) {
        // Offer is exclusive, manual discounts are ignored
        discountsApplied.push({
          source: 'MANUAL',
          applied: false,
          previousPrice: price,
          resultingPrice: price,
          scope: 'TOTAL',
          manualDiscount,
          reasonIgnored: 'exclusive_offer',
        });
        breakdown.push({
          step: 'manualDiscount_ignored',
          previousPrice: price,
          newPrice: price,
          delta: 0,
          scope: 'TOTAL',
          details: { reason: 'exclusive_offer' },
        });
      } else {
        if (!storeProduct) {
          throw new NotFoundException('Producto de tienda no encontrado');
        }

        await this.userDiscountValidator.validate({
          userID,
          manualDiscount,
          storeProduct,
          baseUnitPrice: unitPrice,
          currentUnitPrice: price / quantity,
          quantity,
        });

        const prev = price;
        price = price * (1 - manualDiscount / 100);
        discountsApplied.push({
          source: 'MANUAL',
          applied: true,
          previousPrice: prev,
          resultingPrice: price,
          scope: 'TOTAL',
          manualDiscount,
        });
        breakdown.push({
          step: 'manualDiscount',
          previousPrice: prev,
          newPrice: price,
          delta: price - prev,
          scope: 'TOTAL',
          details: { manualDiscount },
        });
        discountApplied = true;
      }
    }

    const finalUnitPrice = price / quantity;
    this.marginValidator.validate(unitCost, finalUnitPrice);

    const finalPrice = Math.round(price * 100) / 100;

    const roundedBreakdown = breakdown.map((b) => ({
      ...b,
      previousPrice: Math.round(b.previousPrice * 100) / 100,
      newPrice: Math.round(b.newPrice * 100) / 100,
      delta: Math.round(b.delta * 100) / 100,
    }));

    return {
      basePrice,
      finalPrice,
      breakdown: roundedBreakdown,
      discountApplied,
      discountsApplied,
      discountDetails,
      pricingContext,
    };
  }

  private async resolveBasePricing({
    storeProduct,
    baseUnitPrice,
    priceCost,
  }: {
    storeProduct: StoreProduct | null;
    baseUnitPrice?: number;
    priceCost?: number;
  }): Promise<{ unitPrice: number; unitCost: number }> {
    let unitPrice =
      baseUnitPrice !== undefined
        ? baseUnitPrice
        : typeof storeProduct?.priceList === 'number'
          ? storeProduct.priceList
          : 0;

    let unitCost =
      priceCost !== undefined
        ? priceCost
        : typeof storeProduct?.priceCost === 'number'
          ? storeProduct.priceCost
          : 0;

    const needsFallback =
      storeProduct !== null &&
      storeProduct.variation?.variationID &&
      (unitPrice <= 0 || unitCost <= 0);

    if (!needsFallback) {
      return { unitPrice, unitCost };
    }

    const centralStoreProduct = await this.dataSource.manager.findOne(
      StoreProduct,
      {
        where: {
          store: { isCentralStore: true },
          variation: { variationID: storeProduct.variation.variationID },
        },
        relations: ['store'],
      },
    );

    if (!centralStoreProduct) {
      return { unitPrice, unitCost };
    }

    if (unitPrice <= 0 && typeof centralStoreProduct.priceList === 'number') {
      unitPrice = centralStoreProduct.priceList;
    }

    if (unitCost <= 0 && typeof centralStoreProduct.priceCost === 'number') {
      unitCost = centralStoreProduct.priceCost;
    }

    return { unitPrice, unitCost };
  }
}
