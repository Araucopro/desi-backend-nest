import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  In,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import { PriceHistory, PriceType } from './entities/price-history.entity';
import { UpdatePriceDto } from './dto/update-price.dto';
import { StoreProduct } from '../relations/storeproduct/entities/storeproduct.entity';
import { StoreType } from '../stores/entities/store.entity';
import {
  DiscountScope,
  DiscountType,
  SpecialOffer,
} from './entities/special-offer.entity';
import {
  AppliedDiscount,
  BreakdownEntry,
  CalculateCartInput,
  CalculateCartResult,
  CartItemInput,
  CartPricingItem,
  PricingInput,
  PricingResult,
} from './dto/pricing.dto';
import { OfferCartContext, OfferCartItem, OfferService } from './offer.service';
import { MarginValidator } from './validators/margin.validator';
import { UserDiscountValidator } from './validators/user-discount.validator';
import { PricingListQueryDto } from './dto/pricing-list.query.dto';
import { TenantContextService } from '../multitenant/tenant-context.service';

type MutableCartLine = {
  storeProductID: string;
  storeID: string;
  storeType?: StoreType;
  variationID: string;
  productID: string;
  productName: string;
  sku: string;
  categoryID?: string | null;
  brand?: string | null;
  model?: string | null;
  quantity: number;
  baseUnitPrice: number;
  unitCost: number;
  basePrice: number;
  currentTotal: number;
  discountsApplied: AppliedDiscount[];
  breakdown: BreakdownEntry[];
  storeProduct: StoreProduct;
};

@Injectable()
export class PricingService {
  constructor(
    @InjectRepository(PriceHistory)
    private readonly priceHistoryRepository: Repository<PriceHistory>,
    private readonly dataSource: DataSource,
    private readonly offerService: OfferService,
    private readonly marginValidator: MarginValidator,
    private readonly userDiscountValidator: UserDiscountValidator,
    @Optional() private readonly tenantContext?: TenantContextService,
  ) {}

  private runInTransaction<T>(
    callback: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return this.tenantContext
      ? this.tenantContext.transaction(callback)
      : this.dataSource.transaction(callback);
  }

  async updatePrice(updatePriceDto: UpdatePriceDto): Promise<PriceHistory> {
    const { storeID, variationID, priceType, newPrice, reason, changedBy } =
      updatePriceDto;

    return this.runInTransaction(async (manager) => {
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

  async calculateCart(input: CalculateCartInput): Promise<CalculateCartResult> {
    const pricingDate = this.parsePricingDate(input.pricingDate ?? new Date());
    this.validateManualDiscount(input.manualDiscount);
    if (!input.items.length) {
      return {
        items: [],
        totals: { subtotal: 0, discount: 0, total: 0 },
        pricingContext: { pricingDate: pricingDate.toISOString() },
      };
    }

    const groupedItems = this.groupCartItems(input.items);
    const storeProductIDs = Array.from(groupedItems.keys());

    return this.runInTransaction(async (manager) => {
      let storeID = input.storeID;
      if (!storeID) {
        if (storeProductIDs.length !== 1) {
          throw new BadRequestException(
            'storeID es requerido cuando hay más de un ítem',
          );
        }
        const single = await manager.findOne(StoreProduct, {
          where: { storeProductID: storeProductIDs[0] },
          relations: ['store'],
        });
        if (!single) {
          throw new NotFoundException('Producto de tienda no encontrado');
        }
        storeID = single.store.storeID;
      }

      const storeProducts = await manager.find(StoreProduct, {
        where: {
          store: { storeID },
          storeProductID: In(storeProductIDs),
        },
        relations: [
          'store',
          'variation',
          'variation.product',
          'variation.product.category',
        ],
      });
      if (storeProducts.length !== storeProductIDs.length) {
        throw new NotFoundException(
          'Uno o más productos no pertenecen a la tienda',
        );
      }

      const lines = await this.buildLines(manager, storeProducts, groupedItems);
      const cartContext: OfferCartContext = {
        storeID,
        pricingDate,
        items: lines.map((line) => this.toOfferCartItem(line)),
      };

      const offers = await this.offerService.getApplicableOffers(
        cartContext,
        pricingDate,
      );
      let exclusiveApplied = false;

      for (const offer of offers) {
        const applicableIDs =
          await this.offerService.getApplicableStoreProductIDs(
            offer,
            cartContext,
          );
        const applicableLines = lines.filter((line) =>
          applicableIDs.has(line.storeProductID),
        );
        if (!applicableLines.length) continue;

        if (offer.discountType === DiscountType.BUY_X_GET_Y) {
          this.applyBuyXGetY(applicableLines, offer);
        } else if (offer.discountType === DiscountType.BUNDLE) {
          this.applyBundle(applicableLines, offer);
        } else {
          for (const line of applicableLines) {
            this.applyStandardOffer(line, offer);
          }
        }

        if (offer.exclusive) {
          exclusiveApplied = true;
          break;
        }
      }

      if (input.manualDiscount !== undefined && input.manualDiscount !== null) {
        if (exclusiveApplied) {
          for (const line of lines) {
            this.recordManualIgnored(line, input.manualDiscount);
          }
        } else {
          for (const line of lines) {
            await this.userDiscountValidator.validate({
              userID: input.userID ?? null,
              manualDiscount: input.manualDiscount,
              storeProduct: line.storeProduct,
              baseUnitPrice: line.baseUnitPrice,
              currentUnitPrice: line.currentTotal / line.quantity,
              quantity: line.quantity,
            });
            this.applyManualDiscount(line, input.manualDiscount);
          }
        }
      }

      for (const line of lines) {
        this.marginValidator.validate(
          line.unitCost,
          line.currentTotal / line.quantity,
        );
      }

      const items: CartPricingItem[] = lines.map((line) => ({
        storeProductID: line.storeProductID,
        variationID: line.variationID,
        productID: line.productID,
        productName: line.productName,
        sku: line.sku,
        quantity: line.quantity,
        baseUnitPrice: line.baseUnitPrice,
        unitCost: line.unitCost,
        basePrice: line.basePrice,
        finalUnitPrice: this.toMoney(line.currentTotal / line.quantity),
        lineTotal: line.currentTotal,
        discountsApplied: line.discountsApplied,
        breakdown: line.breakdown,
      }));

      const subtotal = this.toMoney(
        lines.reduce((acc, line) => acc + line.basePrice, 0),
      );
      const total = this.toMoney(
        lines.reduce((acc, line) => acc + line.currentTotal, 0),
      );
      const discount = this.toMoney(Math.max(subtotal - total, 0));
      const firstStore = lines[0]?.storeProduct.store;

      return {
        items,
        totals: { subtotal, discount, total },
        pricingContext: {
          pricingDate: pricingDate.toISOString(),
          storeID,
          storeType: firstStore?.type,
        },
      };
    });
  }

  async calculatePrice(input: PricingInput): Promise<PricingResult> {
    const quantity = input.quantity ?? 1;
    if (!quantity || quantity <= 0) {
      throw new BadRequestException('Quantity must be greater than zero');
    }
    this.validateManualDiscount(input.manualDiscount);
    const pricingDate = this.parsePricingDate(input.pricingDate ?? new Date());

    const cart = await this.calculateCart({
      storeID: '',
      items: [
        {
          storeProductID: input.storeProductID,
          quantity,
          baseUnitPrice: input.baseUnitPrice,
          priceCost: input.priceCost,
        },
      ],
      userID: input.userID,
      manualDiscount: input.manualDiscount,
      pricingDate,
    });
    const item = cart.items[0];
    if (!item) {
      throw new NotFoundException('Producto de tienda no encontrado');
    }

    const automatic = item.discountsApplied.find(
      (discount) => discount.source === 'AUTO' && discount.applied,
    );

    return {
      basePrice: item.basePrice,
      finalPrice: item.lineTotal,
      breakdown: item.breakdown,
      discountApplied: item.discountsApplied.some(
        (discount) => discount.applied,
      ),
      discountsApplied: item.discountsApplied,
      discountDetails: automatic ?? null,
      pricingContext: {
        pricingDate: pricingDate.toISOString(),
        storeID: cart.pricingContext.storeID,
        productID: item.productID,
        variationID: item.variationID,
        storeType: cart.pricingContext.storeType,
      },
    };
  }

  private async buildLines(
    manager: EntityManager,
    storeProducts: StoreProduct[],
    groupedItems: Map<
      string,
      { quantity: number; baseUnitPrice?: number; priceCost?: number }
    >,
  ): Promise<MutableCartLine[]> {
    const baseRows = storeProducts.map((storeProduct) => {
      const override = groupedItems.get(storeProduct.storeProductID);
      return {
        storeProduct,
        baseUnitPrice:
          override?.baseUnitPrice !== undefined
            ? override.baseUnitPrice
            : Number(storeProduct.priceList ?? 0),
        unitCost:
          override?.priceCost !== undefined
            ? override.priceCost
            : Number(storeProduct.priceCost ?? 0),
      };
    });

    const needsFallback = baseRows.filter(
      (row) => row.baseUnitPrice <= 0 || row.unitCost <= 0,
    );
    if (needsFallback.length) {
      const variationIDs = Array.from(
        new Set(
          needsFallback.map((row) => row.storeProduct.variation?.variationID),
        ).values(),
      ).filter(Boolean);
      if (variationIDs.length) {
        const centralRows = await manager.find(StoreProduct, {
          where: {
            store: { isCentralStore: true },
            variation: { variationID: In(variationIDs) },
          },
          relations: ['store'],
        });
        const centralByVariation = new Map(
          centralRows.map((row) => [row.variation?.variationID, row]),
        );
        for (const row of baseRows) {
          const central = centralByVariation.get(
            row.storeProduct.variation?.variationID,
          );
          if (!central) continue;
          if (row.baseUnitPrice <= 0 && typeof central.priceList === 'number') {
            row.baseUnitPrice = central.priceList;
          }
          if (row.unitCost <= 0 && typeof central.priceCost === 'number') {
            row.unitCost = central.priceCost;
          }
        }
      }
    }

    return baseRows.map((row) => {
      const storeProduct = row.storeProduct;
      const product = storeProduct.variation?.product;
      const quantity =
        groupedItems.get(storeProduct.storeProductID)?.quantity ?? 0;
      const basePrice = this.toMoney(row.baseUnitPrice * quantity);
      const breakdown: BreakdownEntry[] = [
        {
          step: 'basePrice',
          previousPrice: basePrice,
          newPrice: basePrice,
          delta: 0,
          scope: 'TOTAL',
          details: { unitPrice: row.baseUnitPrice, quantity },
        },
      ];
      return {
        storeProductID: storeProduct.storeProductID,
        storeID: storeProduct.store?.storeID,
        storeType: storeProduct.store?.type,
        variationID: storeProduct.variation?.variationID,
        productID: product?.productID,
        productName: product?.name ?? storeProduct.variation?.sku,
        sku: storeProduct.variation?.sku,
        categoryID: product?.category?.categoryID ?? product?.categoryID,
        brand: product?.brand ?? null,
        model: product?.name ?? null,
        quantity,
        baseUnitPrice: row.baseUnitPrice,
        unitCost: row.unitCost,
        basePrice,
        currentTotal: basePrice,
        discountsApplied: [],
        breakdown,
        storeProduct,
      };
    });
  }

  private toOfferCartItem(line: MutableCartLine): OfferCartItem {
    return {
      storeProductID: line.storeProductID,
      storeID: line.storeID,
      productID: line.productID,
      variationID: line.variationID,
      categoryID: line.categoryID,
      brand: line.brand,
      model: line.model,
      quantity: line.quantity,
      unitPrice: line.baseUnitPrice,
    };
  }

  private groupCartItems(
    items: CartItemInput[],
  ): Map<
    string,
    { quantity: number; baseUnitPrice?: number; priceCost?: number }
  > {
    const grouped = new Map<
      string,
      { quantity: number; baseUnitPrice?: number; priceCost?: number }
    >();
    for (const item of items) {
      if (!item.quantity || item.quantity <= 0) {
        throw new BadRequestException('Quantity must be greater than zero');
      }
      const current = grouped.get(item.storeProductID);
      grouped.set(item.storeProductID, {
        quantity: (current?.quantity ?? 0) + item.quantity,
        baseUnitPrice: item.baseUnitPrice ?? current?.baseUnitPrice,
        priceCost: item.priceCost ?? current?.priceCost,
      });
    }
    return grouped;
  }

  private applyStandardOffer(line: MutableCartLine, offer: SpecialOffer) {
    const scope: DiscountScope = offer.scope ?? DiscountScope.UNIT;
    const currentUnitPrice = line.currentTotal / line.quantity;
    const previousPrice = line.currentTotal;
    let nextPrice = previousPrice;

    switch (offer.discountType) {
      case DiscountType.PERCENTAGE:
        if (scope === DiscountScope.UNIT) {
          nextPrice =
            currentUnitPrice * (1 - offer.value / 100) * line.quantity;
        } else {
          nextPrice = previousPrice * (1 - offer.value / 100);
        }
        break;
      case DiscountType.FIXED_AMOUNT:
        if (scope === DiscountScope.UNIT) {
          nextPrice =
            Math.max(0, currentUnitPrice - offer.value) * line.quantity;
        } else {
          nextPrice = Math.max(0, previousPrice - offer.value);
        }
        break;
      case DiscountType.FIXED_PRICE:
        nextPrice =
          scope === DiscountScope.UNIT
            ? offer.value * line.quantity
            : offer.value;
        break;
      default:
        return;
    }

    nextPrice = this.toMoney(Math.max(0, nextPrice));
    line.currentTotal = nextPrice;
    this.recordAutomaticDiscount(line, offer, previousPrice, nextPrice, scope);
  }

  private applyBuyXGetY(lines: MutableCartLine[], offer: SpecialOffer) {
    const buyQuantity = offer.buyQuantity ?? 0;
    const payQuantity = offer.payQuantity ?? 0;
    if (buyQuantity <= 0 || payQuantity <= 0 || buyQuantity <= payQuantity) {
      return;
    }
    const totalUnits = lines.reduce((acc, line) => acc + line.quantity, 0);
    const groups = Math.floor(totalUnits / buyQuantity);
    const freeUnits = groups * (buyQuantity - payQuantity);
    if (freeUnits <= 0) return;
    this.grantFreeUnits(lines, freeUnits, offer, 'buyXGetY', {
      buyQuantity,
      payQuantity,
      groups,
      freeUnits,
    });
  }

  private applyBundle(lines: MutableCartLine[], offer: SpecialOffer) {
    const bundleItems = offer.bundleItems ?? [];
    if (bundleItems.length < 2) return;
    const quantitiesByProduct = new Map<string, number>();
    for (const line of lines) {
      quantitiesByProduct.set(
        line.productID,
        (quantitiesByProduct.get(line.productID) ?? 0) + line.quantity,
      );
    }
    let sets = Number.POSITIVE_INFINITY;
    for (const item of bundleItems) {
      const quantity = quantitiesByProduct.get(item.productID) ?? 0;
      const required = Math.max(1, item.requiredQuantity);
      sets = Math.min(sets, Math.floor(quantity / required));
    }
    if (!Number.isFinite(sets) || sets <= 0) return;
    const freeUnits = sets;
    this.grantFreeUnits(lines, freeUnits, offer, 'bundle', {
      sets,
      freeUnits,
    });
  }

  private grantFreeUnits(
    lines: MutableCartLine[],
    count: number,
    offer: SpecialOffer,
    step: string,
    details: Record<string, unknown>,
  ) {
    const candidates = lines
      .map((line) => ({
        line,
        unitPrice: line.currentTotal / line.quantity,
      }))
      .filter((candidate) => candidate.unitPrice > 0)
      .sort(
        (left, right) =>
          left.unitPrice - right.unitPrice ||
          left.line.storeProductID.localeCompare(right.line.storeProductID),
      );

    let remaining = count;
    for (const candidate of candidates) {
      if (remaining <= 0) break;
      const free = Math.min(candidate.line.quantity, remaining);
      const previousPrice = candidate.line.currentTotal;
      const freeValue = this.toMoney(free * candidate.unitPrice);
      const nextPrice = this.toMoney(Math.max(0, previousPrice - freeValue));
      if (nextPrice === previousPrice) continue;

      candidate.line.currentTotal = nextPrice;
      this.recordAutomaticDiscount(
        candidate.line,
        offer,
        previousPrice,
        nextPrice,
        DiscountScope.TOTAL,
        { ...details, freeUnits: free },
      );
      remaining -= free;
    }
  }

  private recordAutomaticDiscount(
    line: MutableCartLine,
    offer: SpecialOffer,
    previousPrice: number,
    resultingPrice: number,
    scope: DiscountScope,
    details?: Record<string, unknown>,
  ) {
    line.discountsApplied.push({
      source: 'AUTO',
      applied: true,
      previousPrice,
      resultingPrice,
      scope,
      offerID: offer.offerID,
      description: offer.description,
      discountType: offer.discountType,
      value: offer.value,
      exclusive: !!offer.exclusive,
      priority: offer.priority,
      details,
    });
    line.breakdown.push({
      step: details ? 'cartOffer' : 'automaticOffer',
      previousPrice,
      newPrice: resultingPrice,
      delta: this.toMoney(resultingPrice - previousPrice),
      scope,
      details: details ?? {
        offerID: offer.offerID,
        type: offer.discountType,
        value: offer.value,
        priority: offer.priority,
      },
    });
  }

  private applyManualDiscount(line: MutableCartLine, manualDiscount: number) {
    const previousPrice = line.currentTotal;
    const resultingPrice = this.toMoney(
      Math.max(0, previousPrice * (1 - manualDiscount / 100)),
    );
    line.currentTotal = resultingPrice;
    line.discountsApplied.push({
      source: 'MANUAL',
      applied: true,
      previousPrice,
      resultingPrice,
      scope: 'TOTAL',
      manualDiscount,
    });
    line.breakdown.push({
      step: 'manualDiscount',
      previousPrice,
      newPrice: resultingPrice,
      delta: this.toMoney(resultingPrice - previousPrice),
      scope: 'TOTAL',
      details: { manualDiscount },
    });
  }

  private recordManualIgnored(line: MutableCartLine, manualDiscount: number) {
    line.discountsApplied.push({
      source: 'MANUAL',
      applied: false,
      previousPrice: line.currentTotal,
      resultingPrice: line.currentTotal,
      scope: 'TOTAL',
      manualDiscount,
      reasonIgnored: 'exclusive_offer',
    });
    line.breakdown.push({
      step: 'manualDiscount_ignored',
      previousPrice: line.currentTotal,
      newPrice: line.currentTotal,
      delta: 0,
      scope: 'TOTAL',
      details: { reason: 'exclusive_offer' },
    });
  }

  private parsePricingDate(value: string | Date): Date {
    const pricingDate =
      value instanceof Date ? value : value ? new Date(value) : new Date();
    if (Number.isNaN(pricingDate.getTime())) {
      throw new BadRequestException('pricingDate must be a valid date');
    }
    return pricingDate;
  }

  private validateManualDiscount(manualDiscount?: number) {
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
  }

  private toMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
