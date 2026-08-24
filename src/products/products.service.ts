import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { Product } from './entities/product.entity';
import { ProductVariation } from './entities/product-variation.entity';
import { CreateProductDto } from './dto/create-product.dto';
import {
  BulkProductItemDto,
  CreateProductsBulkDto,
} from './dto/create-products-bulk.dto';
import { PricingService } from '../pricing/pricing.service';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductListQueryDto } from './dto/product-list.query.dto';
import { ProductListResponseDto } from './dto/product-list-response.dto';
import { InventoryMovementReason } from '../inventory/entities/inventory-movement.entity';
import { InventoryService } from '../inventory/inventory.service';
import { PriceType } from '../pricing/entities/price-history.entity';
import { TenantContextService } from '../multitenant/tenant-context.service';
import { TransactionRunnerService } from '../common/services/transaction-runner.service';
import { Category } from '../categories/entities/category.entity';
import { buildVariationPlan, VariationPlanAction } from './products-engine';
import {
  createProductEntity,
  createVariationEntity,
  deleteProductById,
  findCentralStore,
  findProductForUpdate,
  findProductWithRelations,
  findProductsPaginated,
  saveProduct,
  saveVariation,
} from './products-repository.helpers';

interface NormalizedBulkProductItem extends BulkProductItemDto {
  normalizedName: string;
  normalizedCategoryName?: string;
}

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(ProductVariation)
    private readonly variationRepository: Repository<ProductVariation>,
    private readonly entityManager: EntityManager,
    private readonly pricingService: PricingService,
    private readonly inventoryService: InventoryService,
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

      const savedProduct = await saveProduct(
        transactionalEntityManager,
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
        const savedVariation = await saveVariation(
          transactionalEntityManager,
          createVariationEntity(transactionalEntityManager, {
            dto: variationDto,
            product: savedProduct,
            tenantID,
          }),
        );

        if (centralStore) {
          await this.inventoryService.applyMovement(
            transactionalEntityManager,
            {
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
            },
          );
        }
      }

      return savedProduct;
    });
  }

  /**
   * Crea o actualiza productos de forma masiva en una sola transacción.
   *
   * - Los productos se resuelven por nombre normalizado (trim + case-insensitive):
   *   si existe, se actualiza; si no, se crea.
   * - Las variantes se sincronizan por SKU (misma semántica que el update singular).
   * - La categoría se resuelve por nombre y, si no existe, se crea como categoría
   *   raíz dentro de la misma transacción.
   * - Si existe tienda central, cada variante genera su StoreProduct y su
   *   movimiento ADJUSTMENT con el stock informado.
   */
  async bulkUpsert(dto: CreateProductsBulkDto): Promise<Product[]> {
    const items = this.normalizeBulkItems(dto.items);

    return this.runInTransaction(async (manager) => {
      const tenantID = this.tenantContext?.getTenantId();
      const categories = await this.resolveCategories(manager, items, tenantID);
      const existingByName = await this.findExistingProductsByName(
        manager,
        items,
        tenantID,
      );
      const skuOwners = await this.findExistingSkuOwners(
        manager,
        items,
        tenantID,
      );
      const centralStore = await findCentralStore(manager, tenantID);
      const results: Product[] = [];

      for (const item of items) {
        const existingProduct = existingByName.get(item.normalizedName);

        for (const variation of item.variations) {
          const ownerProductID = skuOwners.get(variation.sku);
          if (ownerProductID && ownerProductID !== existingProduct?.productID) {
            throw new BadRequestException(
              `El SKU ${variation.sku} ya pertenece al producto ${ownerProductID} y no puede asignarse a "${item.name}".`,
            );
          }
        }

        const categoryID = item.normalizedCategoryName
          ? categories.get(item.normalizedCategoryName)?.categoryID
          : undefined;

        if (existingProduct) {
          const product = await findProductForUpdate(
            manager,
            existingProduct.productID,
          );

          manager.merge(Product, product, {
            name: item.name,
            ...(item.image !== undefined ? { image: item.image } : {}),
            ...(item.brand !== undefined ? { brand: item.brand } : {}),
            ...(item.genre !== undefined ? { genre: item.genre } : {}),
            ...(item.description !== undefined
              ? { description: item.description }
              : {}),
            ...(categoryID ? { categoryID } : {}),
          });

          const savedProduct = await saveProduct(manager, product);
          const plan = buildVariationPlan({
            variations: item.variations,
            existing: product.variations,
          });

          for (const action of plan) {
            if (action.kind === 'create') {
              await this.applyVariationCreate(
                manager,
                action,
                savedProduct,
                centralStore?.storeID,
                tenantID,
              );
            } else if (action.kind === 'update') {
              await this.applyVariationUpdate(
                manager,
                action,
                centralStore?.storeID,
                tenantID,
              );
            } else {
              await manager.remove(action.variation);
            }
          }

          results.push(
            await this.findProductWithRelationsOrFail(
              manager,
              savedProduct.productID,
            ),
          );
          continue;
        }

        const savedProduct = await saveProduct(
          manager,
          createProductEntity(manager, {
            name: item.name,
            tenantID,
            ...(categoryID ? { categoryID } : {}),
            ...(item.image !== undefined ? { image: item.image } : {}),
            ...(item.brand !== undefined ? { brand: item.brand } : {}),
            ...(item.genre !== undefined ? { genre: item.genre } : {}),
            ...(item.description !== undefined
              ? { description: item.description }
              : {}),
          }),
        );

        for (const variationDto of item.variations) {
          await this.applyVariationCreate(
            manager,
            { kind: 'create', dto: variationDto },
            savedProduct,
            centralStore?.storeID,
            tenantID,
          );
        }

        results.push(
          await this.findProductWithRelationsOrFail(
            manager,
            savedProduct.productID,
          ),
        );
      }

      return results;
    });
  }

  private normalizeBulkItems(
    items: BulkProductItemDto[],
  ): NormalizedBulkProductItem[] {
    const seenProductNames = new Set<string>();
    const seenSkus = new Set<string>();

    return items.map((item, index) => {
      const name = item.name.trim();
      if (!name) {
        throw new BadRequestException(
          `El nombre del producto en la posición ${index + 1} no puede estar vacío.`,
        );
      }

      const normalizedName = name.toLowerCase();
      if (seenProductNames.has(normalizedName)) {
        throw new BadRequestException(
          `El producto "${item.name}" está duplicado en la carga masiva.`,
        );
      }
      seenProductNames.add(normalizedName);

      const normalizedCategoryName =
        item.categoryName?.trim().toLowerCase() || undefined;
      if (item.categoryName && !normalizedCategoryName) {
        throw new BadRequestException(
          `La categoría del producto "${item.name}" no puede estar vacía.`,
        );
      }

      for (const variation of item.variations) {
        if (!variation.sku.trim()) {
          throw new BadRequestException(
            `Una variante del producto "${item.name}" tiene un SKU vacío.`,
          );
        }
        if (seenSkus.has(variation.sku)) {
          throw new BadRequestException(
            `El SKU ${variation.sku} está duplicado en la carga masiva.`,
          );
        }
        seenSkus.add(variation.sku);
      }

      return { ...item, name, normalizedName, normalizedCategoryName };
    });
  }

  private async resolveCategories(
    manager: EntityManager,
    items: NormalizedBulkProductItem[],
    tenantID?: string,
  ): Promise<Map<string, Category>> {
    const namesByKey = new Map<string, string>();
    for (const item of items) {
      if (item.normalizedCategoryName && item.categoryName) {
        namesByKey.set(item.normalizedCategoryName, item.categoryName.trim());
      }
    }
    if (namesByKey.size === 0) return new Map();

    const categoryRepository = manager.getRepository(Category);
    const existing = await categoryRepository.find({
      where: tenantID ? { tenantID } : {},
      select: ['categoryID', 'name'],
    });

    const byName = new Map<string, Category>();
    for (const category of existing) {
      const key = category.name.trim().toLowerCase();
      if (namesByKey.has(key)) byName.set(key, category);
    }

    const missing = [...namesByKey.keys()].filter((key) => !byName.has(key));
    if (missing.length > 0) {
      const created = await manager.save(
        missing.map((key) =>
          manager.create(Category, {
            name: namesByKey.get(key)!,
            ...(tenantID ? { tenantID } : {}),
          }),
        ),
      );
      for (const category of created) {
        byName.set(category.name.trim().toLowerCase(), category);
      }
    }

    return byName;
  }

  private async findExistingProductsByName(
    manager: EntityManager,
    items: NormalizedBulkProductItem[],
    tenantID?: string,
  ): Promise<Map<string, Product>> {
    const names = [...new Set(items.map((item) => item.normalizedName))];
    if (names.length === 0) return new Map();

    const query = manager
      .getRepository(Product)
      .createQueryBuilder('product')
      .select(['product.productID', 'product.name'])
      .where('LOWER(TRIM(product.name)) IN (:...names)', { names });
    if (tenantID) query.andWhere('product.tenantID = :tenantID', { tenantID });

    const existing = await query.getMany();
    const byName = new Map<string, Product>();

    for (const product of existing) {
      const key = product.name.trim().toLowerCase();
      if (byName.has(key)) {
        throw new BadRequestException(
          `Existen varios productos con el nombre normalizado "${product.name}". No se puede resolver el upsert.`,
        );
      }
      byName.set(key, product);
    }

    return byName;
  }

  private async findExistingSkuOwners(
    manager: EntityManager,
    items: NormalizedBulkProductItem[],
    tenantID?: string,
  ): Promise<Map<string, string>> {
    const skus = [
      ...new Set(items.flatMap((item) => item.variations.map((v) => v.sku))),
    ];
    if (skus.length === 0) return new Map();

    const variations = await manager.find(ProductVariation, {
      where: {
        ...(tenantID ? { tenantID } : {}),
        sku: In(skus),
      },
      relations: ['product'],
    });

    return new Map(
      variations.map((variation) => [
        variation.sku,
        variation.product.productID,
      ]),
    );
  }

  private async findProductWithRelationsOrFail(
    manager: EntityManager,
    productID: string,
  ): Promise<Product> {
    const product = await findProductWithRelations(manager, productID);
    if (!product) {
      throw new NotFoundException(`Producto con ID ${productID} no encontrado`);
    }
    return product;
  }

  async findAll(query: ProductListQueryDto): Promise<ProductListResponseDto> {
    return this.runInTransaction(async (manager) => {
      const [products, total] = await findProductsPaginated(manager, query);

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
          page: Math.floor((query.offset ?? 0) / (query.limit ?? 10)) + 1,
          limit: query.limit ?? 10,
          total,
        },
      };
    });
  }

  async findOne(id: string): Promise<Product> {
    return this.runInTransaction(async (manager) => {
      const product = await findProductWithRelations(manager, id);

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
      const savedProduct = await saveProduct(
        transactionalEntityManager,
        product,
      );

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

      const result = await findProductWithRelations(
        transactionalEntityManager,
        id,
      );

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
    const savedVariation = await saveVariation(
      manager,
      createVariationEntity(manager, {
        dto: action.dto,
        product,
        tenantID,
      }),
    );

    if (!centralStoreID) return;

    await this.inventoryService.applyMovement(manager, {
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
    await saveVariation(manager, variation);

    if (!centralStoreID) return;

    const storeProduct = await this.inventoryService.findStoreProductForUpdate(
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

    await this.inventoryService.applyMovement(manager, {
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
      await deleteProductById(manager, id);
    });
  }
}
