import {
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Brackets,
  EntityManager,
  IsNull,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import {
  DiscountScope,
  OfferTargetScope,
  SpecialOffer,
  SpecialOfferBundleItem,
  SpecialOfferProduct,
} from './entities/special-offer.entity';
import { Category } from '../categories/entities/category.entity';
import { CreateSpecialOfferDto } from './dto/create-special-offer.dto';
import { UpdateSpecialOfferDto } from './dto/update-special-offer.dto';
import { SpecialOfferListQueryDto } from './dto/special-offer-list.query.dto';
import { TenantContextService } from '../multitenant/tenant-context.service';
import { TransactionRunnerService } from '../common/services/transaction-runner.service';
import {
  matchesOffer,
  resolveOfferPriority,
  simulateOfferPrice,
  sortOffers,
  validateDateRange,
  validateOfferConfiguration,
} from './offer-engine';
import type {
  OfferCartContext,
  OfferValidationInput,
} from './offer.types';

export type {
  OfferCartContext,
  OfferCartItem,
  OfferValidationInput,
} from './offer.types';

@Injectable()
export class OfferService {
  constructor(
    @InjectRepository(SpecialOffer)
    private readonly specialOfferRepository: Repository<SpecialOffer>,
    @InjectRepository(SpecialOfferProduct)
    private readonly specialOfferProductRepository: Repository<SpecialOfferProduct>,
    @InjectRepository(SpecialOfferBundleItem)
    private readonly specialOfferBundleItemRepository: Repository<SpecialOfferBundleItem>,
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    @Optional() private readonly tenantContext?: TenantContextService,
    @Optional() private readonly transactionRunner?: TransactionRunnerService,
  ) {}

  private runInTransaction<T>(
    callback: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    if (this.transactionRunner) {
      return this.transactionRunner.run(callback);
    }

    if (this.tenantContext) {
      return this.tenantContext.transaction(callback);
    }
    return callback(this.specialOfferRepository.manager);
  }

  async createSpecialOffer(
    createSpecialOfferDto: CreateSpecialOfferDto,
  ): Promise<SpecialOffer> {
    const targetScope =
      createSpecialOfferDto.targetScope ?? OfferTargetScope.VARIATION;
    const config = { ...createSpecialOfferDto, targetScope };
    validateOfferConfiguration(config);
    validateDateRange(
      createSpecialOfferDto.startDate,
      createSpecialOfferDto.endDate,
    );

    return this.runInTransaction(async (manager) => {
      const repository = manager.getRepository(SpecialOffer);
      const offer = repository.create({
        description: createSpecialOfferDto.description,
        discountType: createSpecialOfferDto.discountType,
        value: createSpecialOfferDto.value,
        scope: createSpecialOfferDto.scope ?? DiscountScope.UNIT,
        exclusive: createSpecialOfferDto.exclusive ?? false,
        startDate: new Date(createSpecialOfferDto.startDate),
        endDate: createSpecialOfferDto.endDate
          ? new Date(createSpecialOfferDto.endDate)
          : undefined,
        isActive: createSpecialOfferDto.isActive ?? true,
        targetScope,
        storeProductID: createSpecialOfferDto.storeProductID ?? null,
        storeID: createSpecialOfferDto.storeID ?? null,
        categoryID: createSpecialOfferDto.categoryID ?? null,
        includeSubcategories:
          createSpecialOfferDto.includeSubcategories ?? true,
        brand: createSpecialOfferDto.brand ?? null,
        model: createSpecialOfferDto.model ?? null,
        buyQuantity: createSpecialOfferDto.buyQuantity ?? null,
        payQuantity: createSpecialOfferDto.payQuantity ?? null,
        priority: createSpecialOfferDto.priority ?? 0,
      });
      const savedOffer = await repository.save(offer);

      if (createSpecialOfferDto.productIDs?.length) {
        const productRepository = manager.getRepository(SpecialOfferProduct);
        await productRepository.save(
          createSpecialOfferDto.productIDs.map((productID) =>
            productRepository.create({
              offer: savedOffer,
              offerID: savedOffer.offerID,
              productID,
            }),
          ),
        );
      }

      if (createSpecialOfferDto.bundleItems?.length) {
        const bundleRepository = manager.getRepository(SpecialOfferBundleItem);
        await bundleRepository.save(
          createSpecialOfferDto.bundleItems.map((item) =>
            bundleRepository.create({
              offer: savedOffer,
              offerID: savedOffer.offerID,
              productID: item.productID,
              requiredQuantity: item.requiredQuantity ?? 1,
            }),
          ),
        );
      }

      return this.loadOffer(manager, savedOffer.offerID);
    });
  }

  async updateSpecialOffer(
    offerID: string,
    updateSpecialOfferDto: UpdateSpecialOfferDto,
  ): Promise<SpecialOffer> {
    return this.runInTransaction(async (manager) => {
      const offer = await manager.getRepository(SpecialOffer).findOne({
        where: { offerID },
        relations: ['productTargets', 'bundleItems'],
      });
      if (!offer) throw new NotFoundException('Oferta especial no encontrada');

      const targetScope =
        updateSpecialOfferDto.targetScope ?? offer.targetScope;
      const nextStoreProductID =
        updateSpecialOfferDto.storeProductID ??
        (targetScope === OfferTargetScope.VARIATION
          ? offer.storeProductID
          : null);
      const config: OfferValidationInput = {
        discountType: updateSpecialOfferDto.discountType ?? offer.discountType,
        targetScope,
        storeProductID: nextStoreProductID,
        storeID:
          updateSpecialOfferDto.storeID !== undefined
            ? updateSpecialOfferDto.storeID
            : (offer.storeID ?? null),
        productIDs: updateSpecialOfferDto.productIDs ?? [],
        categoryID:
          updateSpecialOfferDto.categoryID !== undefined
            ? updateSpecialOfferDto.categoryID
            : (offer.categoryID ?? null),
        brand:
          updateSpecialOfferDto.brand !== undefined
            ? updateSpecialOfferDto.brand
            : (offer.brand ?? null),
        model:
          updateSpecialOfferDto.model !== undefined
            ? updateSpecialOfferDto.model
            : (offer.model ?? null),
        buyQuantity:
          updateSpecialOfferDto.buyQuantity ?? offer.buyQuantity ?? null,
        payQuantity:
          updateSpecialOfferDto.payQuantity ?? offer.payQuantity ?? null,
        bundleItems:
          updateSpecialOfferDto.bundleItems ?? offer.bundleItems ?? [],
      };
      validateOfferConfiguration(config);
      validateDateRange(
        updateSpecialOfferDto.startDate ?? offer.startDate,
        updateSpecialOfferDto.endDate ?? offer.endDate,
      );

      Object.assign(offer, {
        ...(updateSpecialOfferDto.description !== undefined
          ? { description: updateSpecialOfferDto.description }
          : {}),
        ...(updateSpecialOfferDto.discountType !== undefined
          ? { discountType: updateSpecialOfferDto.discountType }
          : {}),
        ...(updateSpecialOfferDto.value !== undefined
          ? { value: updateSpecialOfferDto.value }
          : {}),
        ...(updateSpecialOfferDto.scope !== undefined
          ? { scope: updateSpecialOfferDto.scope }
          : {}),
        ...(updateSpecialOfferDto.exclusive !== undefined
          ? { exclusive: updateSpecialOfferDto.exclusive }
          : {}),
        ...(updateSpecialOfferDto.startDate
          ? { startDate: new Date(updateSpecialOfferDto.startDate) }
          : {}),
        ...(updateSpecialOfferDto.endDate !== undefined
          ? {
              endDate: updateSpecialOfferDto.endDate
                ? new Date(updateSpecialOfferDto.endDate)
                : null,
            }
          : {}),
        ...(updateSpecialOfferDto.isActive !== undefined
          ? { isActive: updateSpecialOfferDto.isActive }
          : {}),
        targetScope,
        storeProductID: nextStoreProductID,
        storeID: config.storeID ?? null,
        categoryID: config.categoryID ?? null,
        includeSubcategories:
          updateSpecialOfferDto.includeSubcategories ??
          offer.includeSubcategories,
        brand: config.brand ?? null,
        model: config.model ?? null,
        buyQuantity: config.buyQuantity ?? null,
        payQuantity: config.payQuantity ?? null,
        priority:
          updateSpecialOfferDto.priority !== undefined
            ? updateSpecialOfferDto.priority
            : offer.priority,
      });
      await manager.getRepository(SpecialOffer).save(offer);

      if (updateSpecialOfferDto.productIDs !== undefined) {
        const productRepository = manager.getRepository(SpecialOfferProduct);
        await productRepository.delete({ offerID });
        if (updateSpecialOfferDto.productIDs.length) {
          await productRepository.save(
            updateSpecialOfferDto.productIDs.map((productID) =>
              productRepository.create({
                offer,
                offerID,
                productID,
              }),
            ),
          );
        }
      }

      if (updateSpecialOfferDto.bundleItems !== undefined) {
        const bundleRepository = manager.getRepository(SpecialOfferBundleItem);
        await bundleRepository.delete({ offerID });
        if (updateSpecialOfferDto.bundleItems.length) {
          await bundleRepository.save(
            updateSpecialOfferDto.bundleItems.map((item) =>
              bundleRepository.create({
                offer,
                offerID,
                productID: item.productID,
                requiredQuantity: item.requiredQuantity ?? 1,
              }),
            ),
          );
        }
      }

      return this.loadOffer(manager, offerID);
    });
  }

  async getSpecialOffers(
    filters: SpecialOfferListQueryDto = {},
  ): Promise<SpecialOffer[]> {
    const query: SelectQueryBuilder<SpecialOffer> = this.specialOfferRepository
      .createQueryBuilder('offer')
      .leftJoinAndSelect('offer.storeProduct', 'storeProduct')
      .leftJoinAndSelect('storeProduct.store', 'store')
      .leftJoinAndSelect('storeProduct.variation', 'variation')
      .leftJoinAndSelect('variation.product', 'product')
      .leftJoinAndSelect('offer.store', 'offerStore')
      .leftJoinAndSelect('offer.productTargets', 'productTargets')
      .leftJoinAndSelect('offer.bundleItems', 'bundleItems')
      .orderBy('offer.priority', 'ASC')
      .addOrderBy('offer.startDate', 'DESC')
      .addOrderBy('offer.createdAt', 'DESC');

    if (filters.storeProductID) {
      query.andWhere('storeProduct.storeProductID = :storeProductID', {
        storeProductID: filters.storeProductID,
      });
    }
    if (filters.storeID) {
      query.andWhere(
        '(offer.storeID = :storeID OR storeProduct.store.storeID = :storeID)',
        { storeID: filters.storeID },
      );
    }
    if (filters.targetScope) {
      query.andWhere('offer.targetScope = :targetScope', {
        targetScope: filters.targetScope,
      });
    }
    if (filters.productID) {
      query.andWhere('productTargets.productID = :productID', {
        productID: filters.productID,
      });
      query.distinct(true);
    }
    if (filters.categoryID) {
      query.andWhere('offer.categoryID = :categoryID', {
        categoryID: filters.categoryID,
      });
    }
    if (filters.brand) {
      query.andWhere('offer.brand = :brand', {
        brand: filters.brand,
      });
    }
    if (filters.isActive !== undefined) {
      query.andWhere('offer.isActive = :isActive', {
        isActive: filters.isActive,
      });
    }

    return query.getMany();
  }

  async getActiveOffers(
    storeProductID: string,
    pricingDate: Date = new Date(),
  ): Promise<SpecialOffer[]> {
    return this.specialOfferRepository.find({
      where: [
        {
          storeProductID,
          isActive: true,
          startDate: LessThanOrEqual(pricingDate),
          endDate: MoreThanOrEqual(pricingDate),
        },
        {
          storeProductID,
          isActive: true,
          startDate: LessThanOrEqual(pricingDate),
          endDate: IsNull(),
        },
      ],
      order: { priority: 'ASC', startDate: 'DESC', createdAt: 'DESC' },
    });
  }

  async getBestOffer(
    storeProductID: string,
    unitPrice: number,
    quantity: number,
    pricingDate: Date = new Date(),
  ): Promise<(SpecialOffer & { priority: number }) | null> {
    const offers = await this.getActiveOffers(storeProductID, pricingDate);

    if (!offers.length) {
      return null;
    }

    const rankedOffers = offers
      .map((offer) => ({
        offer,
        finalPrice: simulateOfferPrice(offer, unitPrice, quantity),
        priority: resolveOfferPriority(offer),
      }))
      .sort((left, right) => {
        if (left.finalPrice !== right.finalPrice) {
          return left.finalPrice - right.finalPrice;
        }
        if (left.priority !== right.priority) {
          return right.priority - left.priority;
        }
        return right.offer.startDate.getTime() - left.offer.startDate.getTime();
      });

    const best = rankedOffers[0];
    return Object.assign(best.offer, { priority: best.priority });
  }

  async getActiveOffer(storeProductID: string): Promise<SpecialOffer | null> {
    const [firstOffer] = await this.getActiveOffers(storeProductID);
    return firstOffer ?? null;
  }

  async getApplicableOffers(
    cartContext: OfferCartContext,
    pricingDate: Date = new Date(),
  ): Promise<SpecialOffer[]> {
    const storeProductIDs = cartContext.items.map(
      (item) => item.storeProductID,
    );
    const query = this.specialOfferRepository
      .createQueryBuilder('offer')
      .leftJoinAndSelect('offer.storeProduct', 'storeProduct')
      .leftJoinAndSelect('storeProduct.store', 'store')
      .leftJoinAndSelect('offer.productTargets', 'productTargets')
      .leftJoinAndSelect('offer.bundleItems', 'bundleItems')
      .where('offer.isActive = :isActive', { isActive: true })
      .andWhere('offer.startDate <= :pricingDate', { pricingDate })
      .andWhere('(offer.endDate IS NULL OR offer.endDate >= :pricingDate)')
      .andWhere(
        new Brackets((qb) =>
          qb
            .where('offer.storeID = :storeID')
            .orWhere('storeProduct.storeProductID IN (:...storeProductIDs)'),
        ),
      )
      .setParameters({ storeID: cartContext.storeID, storeProductIDs })
      .orderBy('offer.priority', 'ASC')
      .addOrderBy('offer.startDate', 'DESC')
      .addOrderBy('offer.createdAt', 'DESC')
      .addOrderBy('offer.offerID', 'ASC');

    const offers = await query.getMany();
    const categoryScopes = new Map<string, Set<string>>();

    for (const offer of offers) {
      if (offer.targetScope === OfferTargetScope.CATEGORY && offer.categoryID) {
        if (!categoryScopes.has(offer.categoryID)) {
          categoryScopes.set(
            offer.categoryID,
            await this.resolveCategoryScope(
              offer.categoryID,
              offer.includeSubcategories,
            ),
          );
        }
      }
    }

    return offers
      .filter((offer) => {
        const matchesStore =
          offer.storeID === cartContext.storeID ||
          storeProductIDs.includes(offer.storeProductID ?? '');
        if (!matchesStore) return false;
        return cartContext.items.some((item) =>
          matchesOffer(item, offer, categoryScopes),
        );
      })
      .sort((left, right) => sortOffers(left, right));
  }

  async getApplicableStoreProductIDs(
    offer: SpecialOffer,
    cartContext: OfferCartContext,
  ): Promise<Set<string>> {
    let categoryScopes = new Map<string, Set<string>>();
    if (offer.targetScope === OfferTargetScope.CATEGORY && offer.categoryID) {
      categoryScopes = new Map([
        [
          offer.categoryID,
          await this.resolveCategoryScope(
            offer.categoryID,
            offer.includeSubcategories,
          ),
        ],
      ]);
    }
    return new Set(
      cartContext.items
        .filter((item) => matchesOffer(item, offer, categoryScopes))
        .map((item) => item.storeProductID),
    );
  }

  private async resolveCategoryScope(
    categoryID: string,
    includeSubcategories: boolean,
  ): Promise<Set<string>> {
    const scope = new Set<string>([categoryID]);
    if (!includeSubcategories) return scope;

    const categories = this.tenantContext
      ? await this.tenantContext.transaction((manager) =>
          manager.getRepository(Category).find(),
        )
      : await this.categoryRepository.find();
    const childrenByParent = new Map<string, Category[]>();
    for (const category of categories) {
      if (!category.parentID) continue;
      const siblings = childrenByParent.get(category.parentID) ?? [];
      siblings.push(category);
      childrenByParent.set(category.parentID, siblings);
    }

    const queue = [categoryID];
    while (queue.length) {
      const current = queue.shift()!;
      for (const child of childrenByParent.get(current) ?? []) {
        if (!scope.has(child.categoryID)) {
          scope.add(child.categoryID);
          queue.push(child.categoryID);
        }
      }
    }
    return scope;
  }

  private async loadOffer(
    manager: EntityManager,
    offerID: string,
  ): Promise<SpecialOffer> {
    const offer = await manager.getRepository(SpecialOffer).findOne({
      where: { offerID },
      relations: [
        'storeProduct',
        'storeProduct.store',
        'storeProduct.variation',
        'storeProduct.variation.product',
        'store',
        'product',
        'category',
        'productTargets',
        'bundleItems',
      ],
    });
    if (!offer) throw new NotFoundException('Oferta especial no encontrada');
    return offer;
  }

}
