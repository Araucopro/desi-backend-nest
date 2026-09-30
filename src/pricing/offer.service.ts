import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Brackets,
  EntityManager,
  In,
  IsNull,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import {
  DiscountType,
  DiscountScope,
  OfferTargetScope,
  SpecialOffer,
  SpecialOfferBundleItem,
  SpecialOfferProduct,
} from './entities/special-offer.entity';
import { Category } from '../categories/entities/category.entity';
import {
  CreateSpecialOfferBundleItemDto,
  CreateSpecialOfferDto,
} from './dto/create-special-offer.dto';
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
import type { OfferCartContext, OfferValidationInput } from './offer.types';
import { StoreProduct } from '../relations/storeproduct/entities/storeproduct.entity';

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
      const tenantID = this.tenantContext?.getTenantId();
      let bundleItemsToSave: Array<{
        storeProductID: string;
        productID: string | null;
        requiredQuantity: number;
      }> = [];
      if (
        createSpecialOfferDto.discountType === DiscountType.BUNDLE &&
        createSpecialOfferDto.bundleItems?.length
      ) {
        bundleItemsToSave = await this.resolveBundleStoreProducts(
          manager,
          createSpecialOfferDto.storeID!,
          createSpecialOfferDto.bundleItems,
        );
      }
      const offer = repository.create({
        tenantID,
        description: createSpecialOfferDto.description,
        discountType: createSpecialOfferDto.discountType,
        value: createSpecialOfferDto.value,
        scope: createSpecialOfferDto.scope ?? DiscountScope.UNIT,
        exclusive: createSpecialOfferDto.exclusive ?? false,
        allowBelowMargin: createSpecialOfferDto.allowBelowMargin ?? false,
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
              tenantID,
              offer: savedOffer,
              offerID: savedOffer.offerID,
              productID,
            }),
          ),
        );
      }

      if (bundleItemsToSave.length) {
        const bundleRepository = manager.getRepository(SpecialOfferBundleItem);
        await bundleRepository.save(
          bundleItemsToSave.map((item) =>
            bundleRepository.create({
              tenantID,
              offer: savedOffer,
              offerID: savedOffer.offerID,
              storeProductID: item.storeProductID,
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
      const tenantID = offer.tenantID;

      const targetScope =
        updateSpecialOfferDto.targetScope ?? offer.targetScope;
      const nextStoreProductID =
        updateSpecialOfferDto.storeProductID ??
        (targetScope === OfferTargetScope.VARIATION
          ? offer.storeProductID
          : null);
      const dtoProvidesBundleItems =
        updateSpecialOfferDto.bundleItems !== undefined;
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
      validateOfferConfiguration(config, {
        requireBundleStoreProductIDs: dtoProvidesBundleItems,
      });
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
        ...(updateSpecialOfferDto.allowBelowMargin !== undefined
          ? { allowBelowMargin: updateSpecialOfferDto.allowBelowMargin }
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
                tenantID,
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
        const bundleItemsToSave =
          config.discountType === DiscountType.BUNDLE
            ? await this.resolveBundleStoreProducts(
                manager,
                config.storeID!,
                updateSpecialOfferDto.bundleItems,
              )
            : updateSpecialOfferDto.bundleItems.map((item) => ({
                storeProductID: item.storeProductID,
                productID: item.productID ?? null,
                requiredQuantity: item.requiredQuantity ?? 1,
              }));
        await bundleRepository.delete({ offerID });
        if (bundleItemsToSave.length) {
          await bundleRepository.save(
            bundleItemsToSave.map((item) =>
              bundleRepository.create({
                tenantID,
                offer,
                offerID,
                storeProductID: item.storeProductID,
                productID: item.productID,
                requiredQuantity: item.requiredQuantity,
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
      .leftJoinAndSelect('productTargets.product', 'targetProduct')
      .leftJoinAndSelect('offer.bundleItems', 'bundleItems')
      .leftJoinAndSelect('bundleItems.storeProduct', 'bundleStoreProduct')
      .leftJoinAndSelect('bundleStoreProduct.store', 'bundleStore')
      .leftJoinAndSelect('bundleStoreProduct.variation', 'bundleVariation')
      .leftJoinAndSelect('bundleVariation.product', 'bundleProduct')
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
      .leftJoinAndSelect('bundleItems.storeProduct', 'bundleStoreProduct')
      .leftJoinAndSelect('bundleStoreProduct.store', 'bundleStore')
      .leftJoinAndSelect('bundleStoreProduct.variation', 'bundleVariation')
      .leftJoinAndSelect('bundleVariation.product', 'bundleProduct')
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
        if (offer.discountType === DiscountType.BUNDLE) {
          if (offer.storeID !== cartContext.storeID) return false;
          const bundleStoreProductIDs = new Set(
            (offer.bundleItems ?? [])
              .map((item) => item.storeProductID)
              .filter((id): id is string => !!id),
          );
          return cartContext.items.some((item) =>
            bundleStoreProductIDs.has(item.storeProductID),
          );
        }
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

  /**
   * Carga una sola vez las ofertas para varios StoreProducts y devuelve las
   * ofertas aplicables a cada ítem evaluado de forma aislada. Esto mantiene la
   * semántica de calculatePrice (un ítem por cálculo) sin consultar ofertas por
   * cada fila de tienda.
   */
  async getApplicableOffersForItems(
    manager: EntityManager,
    cartContexts: OfferCartContext[],
  ): Promise<Map<string, SpecialOffer[]>> {
    const result = new Map<string, SpecialOffer[]>();
    const nonEmptyContexts = cartContexts.filter(
      (context) => context.items.length > 0,
    );
    if (nonEmptyContexts.length === 0) return result;

    const contextsByStore = new Map<string, OfferCartContext[]>();
    for (const context of nonEmptyContexts) {
      const contexts = contextsByStore.get(context.storeID) ?? [];
      contexts.push(context);
      contextsByStore.set(context.storeID, contexts);
    }

    const offersByStore = new Map<string, SpecialOffer[]>();
    const allOffers: SpecialOffer[] = [];
    const repository = this.specialOfferRepository;
    for (const [storeID, contexts] of contextsByStore) {
      const storeProductIDs = contexts.flatMap((context) =>
        context.items.map((item) => item.storeProductID),
      );
      const pricingDate = contexts[0].pricingDate;
      const offers = await repository
        .createQueryBuilder('offer')
        .leftJoinAndSelect('offer.storeProduct', 'storeProduct')
        .leftJoinAndSelect('storeProduct.store', 'store')
        .leftJoinAndSelect('offer.productTargets', 'productTargets')
        .leftJoinAndSelect('offer.bundleItems', 'bundleItems')
        .leftJoinAndSelect('bundleItems.storeProduct', 'bundleStoreProduct')
        .leftJoinAndSelect('bundleStoreProduct.store', 'bundleStore')
        .leftJoinAndSelect('bundleStoreProduct.variation', 'bundleVariation')
        .leftJoinAndSelect('bundleVariation.product', 'bundleProduct')
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
        .setParameters({ storeID, storeProductIDs })
        .orderBy('offer.priority', 'ASC')
        .addOrderBy('offer.startDate', 'DESC')
        .addOrderBy('offer.createdAt', 'DESC')
        .addOrderBy('offer.offerID', 'ASC')
        .getMany();

      offersByStore.set(storeID, offers);
      allOffers.push(...offers);
    }

    const needsCategoryTree = allOffers.some(
      (offer) =>
        offer.targetScope === OfferTargetScope.CATEGORY &&
        offer.categoryID &&
        offer.includeSubcategories,
    );
    const categories = needsCategoryTree
      ? await manager.getRepository(Category).find({
          select: ['categoryID', 'parentID'],
        })
      : [];
    const childrenByParent = new Map<string, string[]>();
    for (const category of categories) {
      if (!category.parentID) continue;
      const children = childrenByParent.get(category.parentID) ?? [];
      children.push(category.categoryID);
      childrenByParent.set(category.parentID, children);
    }

    for (const [storeID, contexts] of contextsByStore) {
      const offers = offersByStore.get(storeID) ?? [];
      const categoryScopes = this.buildCategoryScopes(offers, childrenByParent);
      for (const context of contexts) {
        for (const item of context.items) {
          const itemContext: OfferCartContext = { ...context, items: [item] };
          const applicable = offers
            .filter((offer) => {
              if (offer.discountType === DiscountType.BUNDLE) {
                if (offer.storeID !== itemContext.storeID) return false;
                const bundleStoreProductIDs = new Set(
                  (offer.bundleItems ?? [])
                    .map((bundleItem) => bundleItem.storeProductID)
                    .filter((id): id is string => !!id),
                );
                return bundleStoreProductIDs.has(item.storeProductID);
              }

              const matchesStore =
                offer.storeID === itemContext.storeID ||
                item.storeProductID === (offer.storeProductID ?? '');
              return matchesStore && matchesOffer(item, offer, categoryScopes);
            })
            .filter((offer) => {
              if (
                offer.targetScope !== OfferTargetScope.CATEGORY ||
                !offer.categoryID
              ) {
                return true;
              }

              const offerScope = categoryScopes.get(
                `${offer.categoryID}:${offer.includeSubcategories}`,
              );
              return matchesOffer(
                item,
                offer,
                new Map([
                  [offer.categoryID, offerScope ?? new Set([offer.categoryID])],
                ]),
              );
            })
            .sort((left, right) => sortOffers(left, right));
          result.set(item.storeProductID, applicable);
        }
      }
    }

    return result;
  }

  async getApplicableStoreProductIDs(
    offer: SpecialOffer,
    cartContext: OfferCartContext,
  ): Promise<Set<string>> {
    if (offer.discountType === DiscountType.BUNDLE) {
      const bundleStoreProductIDs = new Set(
        (offer.bundleItems ?? [])
          .map((item) => item.storeProductID)
          .filter((id): id is string => !!id),
      );
      return new Set(
        cartContext.items
          .filter((item) => bundleStoreProductIDs.has(item.storeProductID))
          .map((item) => item.storeProductID),
      );
    }
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

  private async resolveBundleStoreProducts(
    manager: EntityManager,
    storeID: string,
    items: CreateSpecialOfferBundleItemDto[],
  ): Promise<
    Array<{
      storeProductID: string;
      productID: string | null;
      requiredQuantity: number;
    }>
  > {
    const storeProducts = await manager.find(StoreProduct, {
      where: {
        store: { storeID },
        storeProductID: In(items.map((item) => item.storeProductID)),
      },
      relations: ['variation', 'variation.product'],
    });
    const byID = new Map(
      storeProducts.map((storeProduct) => [
        storeProduct.storeProductID,
        storeProduct,
      ]),
    );
    return items.map((item) => {
      const storeProduct = byID.get(item.storeProductID);
      if (!storeProduct) {
        throw new BadRequestException(
          `El bundleItem con storeProductID ${item.storeProductID} no pertenece a la tienda ${storeID}`,
        );
      }
      return {
        storeProductID: item.storeProductID,
        productID: storeProduct.variation?.product?.productID ?? null,
        requiredQuantity: item.requiredQuantity ?? 1,
      };
    });
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

  private buildCategoryScopes(
    offers: SpecialOffer[],
    childrenByParent: Map<string, string[]>,
  ): Map<string, Set<string>> {
    const scopes = new Map<string, Set<string>>();
    const categoryOffers = offers.filter(
      (offer) =>
        offer.targetScope === OfferTargetScope.CATEGORY && offer.categoryID,
    );
    if (categoryOffers.length === 0) return scopes;

    for (const offer of categoryOffers) {
      const categoryID = offer.categoryID!;
      const cacheKey = `${categoryID}:${offer.includeSubcategories}`;
      if (scopes.has(cacheKey)) continue;

      const scope = new Set<string>([categoryID]);
      if (offer.includeSubcategories) {
        const queue = [categoryID];
        while (queue.length > 0) {
          const current = queue.shift()!;
          for (const childID of childrenByParent.get(current) ?? []) {
            if (scope.has(childID)) continue;
            scope.add(childID);
            queue.push(childID);
          }
        }
      }
      scopes.set(cacheKey, scope);
      scopes.set(categoryID, scopes.get(categoryID) ?? scope);
    }

    return scopes;
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
        'productTargets.product',
        'bundleItems',
        'bundleItems.storeProduct',
        'bundleItems.storeProduct.store',
        'bundleItems.storeProduct.variation',
        'bundleItems.storeProduct.variation.product',
      ],
    });
    if (!offer) throw new NotFoundException('Oferta especial no encontrada');
    return offer;
  }
}
