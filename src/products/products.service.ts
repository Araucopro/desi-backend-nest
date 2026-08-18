import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Product } from './entities/product.entity';
import { ProductVariation } from './entities/product-variation.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { PricingService } from '../pricing/pricing.service';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductListQueryDto } from './dto/product-list.query.dto';
import { ProductListResponseDto } from './dto/product-list-response.dto';
import { InventoryMovementReason } from '../inventory/entities/inventory-movement.entity';
import {
  applyInventoryMovement,
  findStoreProductForUpdate,
} from '../inventory/inventory-repository.helpers';
import { PriceType } from '../pricing/entities/price-history.entity';
import { TenantContextService } from '../multitenant/tenant-context.service';
import { TransactionRunnerService } from '../common/services/transaction-runner.service';
import { buildVariationPlan, VariationPlanAction } from './products-engine';
import {
  createProductEntity,
  createVariationEntity,
  findCentralStore,
  findProductForUpdate,
} from './products-repository.helpers';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(ProductVariation)
    private readonly variationRepository: Repository<ProductVariation>,
    private readonly entityManager: EntityManager,
    private readonly pricingService: PricingService,
    @Optional() private readonly tenantContext?: TenantContextService,
    @Optional() private readonly transactionRunner?: TransactionRunnerService,
  ) {}

  private runInTransaction<T>(
    callback: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    if (this.transactionRunner) {
      return this.transactionRunner.run(callback);
    }

    return this.tenantContext
      ? this.tenantContext.transaction(callback)
      : this.entityManager.transaction(callback);
  }

  async create(createProductDto: CreateProductDto): Promise<Product> {
    return this.runInTransaction(async (transactionalEntityManager) => {
      const tenantID = this.tenantContext?.getTenantId();
      const { variations, ...productData } = createProductDto;

      const savedProduct = await transactionalEntityManager.save(
        createProductEntity(transactionalEntityManager, {
          ...productData,
          tenantID,
        }),
      );
      const centralStore = await findCentralStore(
        transactionalEntityManager,
        tenantID,
      );

      for (const variationDto of variations) {
        const savedVariation = await transactionalEntityManager.save(
          createVariationEntity(transactionalEntityManager, {
            dto: variationDto,
            product: savedProduct,
            tenantID,
          }),
        );

        if (centralStore) {
          await applyInventoryMovement(transactionalEntityManager, {
            storeID: centralStore.storeID,
            variationID: savedVariation.variationID,
            reason: InventoryMovementReason.ADJUSTMENT,
            newStock: variationDto.stock,
            referenceID: savedProduct.productID,
            tenantID,
            allowNegativeStock: true,
            priceCost: variationDto.priceCost,
            priceList: variationDto.priceList,
            skipZeroDelta: true,
          });
        }
      }

      return savedProduct;
    });
  }

  async findAll(query: ProductListQueryDto): Promise<ProductListResponseDto> {
    return this.runInTransaction(async (manager) => {
      const {
        limit = 10,
        offset = 0,
        search,
        barcode,
        categoryID,
        genre,
      } = query;

      const qb = manager
        .getRepository(Product)
        .createQueryBuilder('product')
        .leftJoinAndSelect('product.category', 'category')
        .leftJoinAndSelect('product.variations', 'variations')
        .leftJoinAndSelect('variations.storeProducts', 'storeProducts')
        .leftJoinAndSelect('storeProducts.store', 'store')
        .leftJoinAndSelect(
          'storeProducts.specialOffers',
          'offer',
          '(offer.isActive = :isActive AND (offer.endDate IS NULL OR offer.endDate >= :now) AND offer.startDate <= :now)',
          { isActive: true, now: new Date() },
        );

      if (search?.trim()) {
        const term = `%${search.trim()}%`;
        qb.andWhere(
          `(product.name ILIKE :term OR product.brand ILIKE :term OR category.name ILIKE :term OR EXISTS (
            SELECT 1 FROM "ProductVariations" "pv"
            WHERE "pv"."productID" = "product"."productID"
              AND ("pv"."sku" ILIKE :term OR "pv"."supplierSku" ILIKE :term OR "pv"."barcode" ILIKE :term)
          ))`,
          { term },
        );
      }

      if (barcode?.trim()) {
        qb.andWhere(
          `EXISTS (
            SELECT 1 FROM "ProductVariations" "pv"
            WHERE "pv"."productID" = "product"."productID" AND "pv"."barcode" = :barcode
          )`,
          { barcode: barcode.trim() },
        );
      }

      if (categoryID) {
        qb.andWhere('product.categoryID = :categoryID', { categoryID });
      }

      if (genre) {
        qb.andWhere('product.genre = :genre', { genre });
      }

      const [products, total] = await qb
        .take(limit)
        .skip(offset)
        .getManyAndCount();

      for (const product of products) {
        if (!product.variations) continue;
        for (const variation of product.variations) {
          if (!variation.storeProducts) continue;
          for (const sp of variation.storeProducts) {
            try {
              const result = await this.pricingService.calculatePrice({
                storeProductID: sp.storeProductID,
                quantity: 1,
              });
              (sp as any).finalPrice = result.finalPrice;
              (sp as any).discountApplied = result.discountApplied;
              (sp as any).discountsApplied = result.discountsApplied ?? [];
              (sp as any).activeOffer = result.discountDetails;
              (sp as any).pricingBreakdown = result.breakdown;
            } catch (e: any) {
              (sp as any).pricingError = e.message || 'Error calculando precio';
            }
          }
        }
      }

      return {
        products,
        meta: {
          page: Math.floor(offset / limit) + 1,
          limit,
          total,
        },
      };
    });
  }

  async findOne(id: string): Promise<Product> {
    return this.runInTransaction(async (manager) => {
      const product = await manager.getRepository(Product).findOne({
        where: { productID: id },
        relations: [
          'variations',
          'variations.storeProducts',
          'variations.storeProducts.store',
          'category',
        ],
      });

      if (!product) {
        throw new NotFoundException(`Producto con ID ${id} no encontrado`);
      }

      return product;
    });
  }

  async update(
    id: string,
    updateProductDto: UpdateProductDto,
  ): Promise<Product> {
    const { variations, ...productData } = updateProductDto;

    return this.runInTransaction(async (transactionalEntityManager) => {
      const product = await findProductForUpdate(
        transactionalEntityManager,
        id,
      );

      transactionalEntityManager.merge(Product, product, productData);
      const savedProduct = await transactionalEntityManager.save(product);

      const tenantID = this.tenantContext?.getTenantId();

      if (variations) {
        const centralStore = await findCentralStore(
          transactionalEntityManager,
          tenantID,
        );
        const plan = buildVariationPlan({
          variations,
          existing: product.variations,
        });

        for (const action of plan) {
          if (action.kind === 'create') {
            await this.applyVariationCreate(
              transactionalEntityManager,
              action,
              savedProduct,
              centralStore?.storeID,
              tenantID,
            );
          } else if (action.kind === 'update') {
            await this.applyVariationUpdate(
              transactionalEntityManager,
              action,
              centralStore?.storeID,
              tenantID,
            );
          } else {
            await transactionalEntityManager.remove(action.variation);
          }
        }
      }

      const result = await transactionalEntityManager.findOne(Product, {
        where: { productID: id },
        relations: [
          'variations',
          'variations.storeProducts',
          'variations.storeProducts.store',
          'category',
        ],
      });

      if (!result) {
        throw new NotFoundException(`Producto con ID ${id} no encontrado`);
      }
      return result;
    });
  }

  private async applyVariationCreate(
    manager: EntityManager,
    action: Extract<VariationPlanAction, { kind: 'create' }>,
    product: Product,
    centralStoreID: string | undefined,
    tenantID: string | undefined,
  ): Promise<void> {
    const savedVariation = await manager.save(
      createVariationEntity(manager, {
        dto: action.dto,
        product,
        tenantID,
      }),
    );

    if (!centralStoreID) return;

    await applyInventoryMovement(manager, {
      storeID: centralStoreID,
      variationID: savedVariation.variationID,
      reason: InventoryMovementReason.ADJUSTMENT,
      newStock: action.dto.stock,
      referenceID: product.productID,
      tenantID,
      allowNegativeStock: true,
      priceCost: action.dto.priceCost,
      priceList: action.dto.priceList,
      skipZeroDelta: true,
    });
  }

  private async applyVariationUpdate(
    manager: EntityManager,
    action: Extract<VariationPlanAction, { kind: 'update' }>,
    centralStoreID: string | undefined,
    tenantID: string | undefined,
  ): Promise<void> {
    const { dto, variation } = action;
    manager.merge(ProductVariation, variation, dto);
    await manager.save(variation);

    if (!centralStoreID) return;

    const storeProduct = await findStoreProductForUpdate(
      manager,
      centralStoreID,
      variation.variationID,
    );

    if (storeProduct) {
      if (
        dto.priceCost !== undefined &&
        dto.priceCost !== storeProduct.priceCost
      ) {
        await this.pricingService.applyPriceChange(manager, storeProduct, {
          priceType: PriceType.COST,
          oldPrice: storeProduct.priceCost,
          newPrice: dto.priceCost,
          reason: 'Actualización de producto',
        });
      }
      if (
        dto.priceList !== undefined &&
        dto.priceList !== storeProduct.priceList
      ) {
        await this.pricingService.applyPriceChange(manager, storeProduct, {
          priceType: PriceType.LIST,
          oldPrice: storeProduct.priceList ?? 0,
          newPrice: dto.priceList,
          reason: 'Actualización de producto',
        });
      }
    }

    await applyInventoryMovement(manager, {
      storeID: centralStoreID,
      variationID: variation.variationID,
      reason: InventoryMovementReason.ADJUSTMENT,
      newStock: dto.stock,
      referenceID: variation.product?.productID ?? variation.variationID,
      tenantID,
      allowNegativeStock: true,
      priceCost: dto.priceCost,
      priceList: dto.priceList,
      skipZeroDelta: true,
    });
  }

  async remove(id: string): Promise<void> {
    return this.runInTransaction(async (manager) => {
      const product = await manager
        .getRepository(Product)
        .findOne({ where: { productID: id } });
      if (!product)
        throw new NotFoundException(`Producto con ID ${id} no encontrado`);
      await manager.getRepository(Product).remove(product);
    });
  }
}
