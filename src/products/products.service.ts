import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { Product } from './entities/product.entity';
import { ProductVariation } from './entities/product-variation.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { PricingService } from '../pricing/pricing.service';
import { UpdateProductDto } from './dto/update-product.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { Store } from '../stores/entities/store.entity';
import { StoreProduct } from '../relations/storeproduct/entities/storeproduct.entity';
import { DiscountType } from '../pricing/entities/special-offer.entity';
import { TenantContextService } from '../multitenant/tenant-context.service';
import { TransactionRunnerService } from '../common/services/transaction-runner.service';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(ProductVariation)
    private readonly variationRepository: Repository<ProductVariation>,
    private readonly entityManager: EntityManager,
    @Optional() private readonly pricingService?: PricingService,
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

      const product = transactionalEntityManager.create(Product, {
        ...productData,
        ...(tenantID ? { tenantID } : {}),
      });
      const savedProduct = await transactionalEntityManager.save(product);

      const centralStore = await transactionalEntityManager.findOne(Store, {
        where: {
          isCentralStore: true,
          ...(tenantID ? { tenantID } : {}),
        },
      });

      for (const variationDto of variations) {
        const variation = transactionalEntityManager.create(ProductVariation, {
          ...variationDto,
          product: savedProduct,
          ...(tenantID ? { tenantID } : {}),
        });
        const savedVariation = await transactionalEntityManager.save(variation);

        if (centralStore) {
          const sp = transactionalEntityManager.create(StoreProduct, {
            store: { storeID: centralStore.storeID },
            variation: { variationID: savedVariation.variationID },
            stock: variationDto.stock,
            priceCost: variationDto.priceCost,
            priceList: variationDto.priceList,
            ...(tenantID ? { tenantID } : {}),
          });
          await transactionalEntityManager.save(sp);
        }
      }

      return savedProduct;
    });
  }

  async findAll(paginationDto: PaginationDto): Promise<Product[]> {
    return this.runInTransaction(async (manager) => {
      const { limit = 10, offset = 0 } = paginationDto;

      const products = await manager
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
        )
        .take(limit)
        .skip(offset)
        .getMany();

      for (const product of products) {
        if (!product.variations) continue;
        for (const variation of product.variations) {
          if (!variation.storeProducts) continue;
          for (const sp of variation.storeProducts) {
            if (this.pricingService) {
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
                (sp as any).pricingError =
                  e.message || 'Error calculando precio';
              }
            } else {
              const offers = sp['specialOffers'] || [];
              const activeOffer = offers.sort(
                (a, b) =>
                  (b.startDate?.getTime?.() || 0) -
                  (a.startDate?.getTime?.() || 0),
              )[0];

              let finalPrice = sp.priceList || 0;
              let discountApplied = false;
              let discountDetails: {
                offerID: string;
                description: string | undefined;
                type: DiscountType;
                value: number;
              } | null = null;

              if (activeOffer) {
                const originalPrice = finalPrice;
                switch (activeOffer.discountType) {
                  case DiscountType.PERCENTAGE:
                    finalPrice = originalPrice * (1 - activeOffer.value / 100);
                    break;
                  case DiscountType.FIXED_AMOUNT:
                    finalPrice = Math.max(0, originalPrice - activeOffer.value);
                    break;
                  case DiscountType.FIXED_PRICE:
                    finalPrice = Number(activeOffer.value);
                    break;
                }
                finalPrice = Math.round(finalPrice * 100) / 100;
                discountApplied = true;
                discountDetails = {
                  offerID: activeOffer.offerID,
                  description: activeOffer.description,
                  type: activeOffer.discountType,
                  value: activeOffer.value,
                };
              }

              (sp as any).finalPrice = finalPrice;
              (sp as any).discountApplied = discountApplied;
              (sp as any).discountsApplied = discountDetails
                ? [{ ...discountDetails, applied: true }]
                : [];
              (sp as any).activeOffer = discountDetails;
            }
          }
        }
      }

      return products;
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
      const product = await transactionalEntityManager.findOne(Product, {
        where: { productID: id },
        relations: ['variations'],
      });

      if (!product) {
        throw new NotFoundException(`Producto con ID ${id} no encontrado`);
      }

      transactionalEntityManager.merge(Product, product, productData);
      const savedProduct = await transactionalEntityManager.save(product);

      const tenantID = this.tenantContext?.getTenantId();

      if (variations) {
        const centralStore = await transactionalEntityManager.findOne(Store, {
          where: {
            isCentralStore: true,
            ...(tenantID ? { tenantID } : {}),
          },
        });

        const existingVariationsMap = new Map(
          product.variations.map((v) => [v.sku, v]),
        );

        for (const vDto of variations) {
          let variation = existingVariationsMap.get(vDto.sku);

          if (variation) {
            transactionalEntityManager.merge(ProductVariation, variation, vDto);
            await transactionalEntityManager.save(variation);
            existingVariationsMap.delete(vDto.sku);

            if (centralStore) {
              let sp = await transactionalEntityManager.findOne(StoreProduct, {
                where: {
                  store: { storeID: centralStore.storeID },
                  variation: { variationID: variation.variationID },
                },
              });

              if (sp) {
                sp.stock = vDto.stock;
                sp.priceCost = vDto.priceCost;
                sp.priceList = vDto.priceList;
                await transactionalEntityManager.save(sp);
              } else {
                sp = transactionalEntityManager.create(StoreProduct, {
                  store: { storeID: centralStore.storeID },
                  variation: { variationID: variation.variationID },
                  stock: vDto.stock,
                  priceCost: vDto.priceCost,
                  priceList: vDto.priceList,
                });
                await transactionalEntityManager.save(sp);
              }
            }
          } else {
            variation = transactionalEntityManager.create(ProductVariation, {
              ...vDto,
              product: savedProduct,
            });
            const savedVariation =
              await transactionalEntityManager.save(variation);

            if (centralStore) {
              const sp = transactionalEntityManager.create(StoreProduct, {
                store: { storeID: centralStore.storeID },
                variation: { variationID: savedVariation.variationID },
                stock: vDto.stock,
                priceCost: vDto.priceCost,
                priceList: vDto.priceList,
              });
              await transactionalEntityManager.save(sp);
            }
          }
        }

        for (const [, variation] of existingVariationsMap) {
          await transactionalEntityManager.remove(variation);
        }
      }

      return transactionalEntityManager
        .findOne(Product, {
          where: { productID: id },
          relations: [
            'variations',
            'variations.storeProducts',
            'variations.storeProducts.store',
            'category',
          ],
        })
        .then((res) => {
          if (!res)
            throw new NotFoundException(`Producto con ID ${id} no encontrado`);
          return res;
        });
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
