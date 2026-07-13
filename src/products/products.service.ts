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

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(ProductVariation)
    private readonly variationRepository: Repository<ProductVariation>,
    private readonly entityManager: EntityManager,
    @Optional() private readonly pricingService?: PricingService,
  ) {}

  async create(createProductDto: CreateProductDto): Promise<Product> {
    return this.entityManager.transaction(
      async (transactionalEntityManager) => {
        const { variations, ...productData } = createProductDto;

        const product = transactionalEntityManager.create(Product, productData);
        const savedProduct = await transactionalEntityManager.save(product);

        // Buscar tienda central para asociar stock inicial
        const centralStore = await transactionalEntityManager.findOne(Store, {
          where: { isCentralStore: true },
        });

        for (const variationDto of variations) {
          const variation = transactionalEntityManager.create(
            ProductVariation,
            {
              ...variationDto,
              product: savedProduct,
            },
          );
          const savedVariation =
            await transactionalEntityManager.save(variation);

          if (centralStore) {
            const sp = transactionalEntityManager.create(StoreProduct, {
              store: { storeID: centralStore.storeID },
              variation: { variationID: savedVariation.variationID },
              stock: variationDto.stock,
              priceCost: variationDto.priceCost,
              priceList: variationDto.priceList,
            });
            await transactionalEntityManager.save(sp);
          }
        }

        return savedProduct;
      },
    );
  }

  async findAll(paginationDto: PaginationDto): Promise<Product[]> {
    const { limit = 10, offset = 0 } = paginationDto;

    const products = await this.productRepository
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

    // Calculate final prices
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
              (sp as any).activeOffer = result.discountDetails;
              (sp as any).pricingBreakdown = result.breakdown;
            } catch (e) {
              (sp as any).pricingError = e.message || 'Error calculando precio';
            }
          } else {
            const offers = sp['specialOffers'] || []; // TypeORM relation
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
            (sp as any).activeOffer = discountDetails;
          }
        }
      }
    }

    return products;
  }

  async findOne(id: string): Promise<Product> {
    const product = await this.productRepository.findOne({
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
  }

  async update(
    id: string,
    updateProductDto: UpdateProductDto,
  ): Promise<Product> {
    const { variations, ...productData } = updateProductDto;

    return this.entityManager.transaction(
      async (transactionalEntityManager) => {
        const product = await transactionalEntityManager.findOne(Product, {
          where: { productID: id },
          relations: ['variations'],
        });

        if (!product) {
          throw new NotFoundException(`Producto con ID ${id} no encontrado`);
        }

        transactionalEntityManager.merge(Product, product, productData);
        const savedProduct = await transactionalEntityManager.save(product);

        if (variations) {
          const centralStore = await transactionalEntityManager.findOne(Store, {
            where: { isCentralStore: true },
          });

          const existingVariationsMap = new Map(
            product.variations.map((v) => [v.sku, v]),
          );

          for (const vDto of variations) {
            let variation = existingVariationsMap.get(vDto.sku);

            if (variation) {
              transactionalEntityManager.merge(
                ProductVariation,
                variation,
                vDto,
              );
              await transactionalEntityManager.save(variation);

              existingVariationsMap.delete(vDto.sku);

              if (centralStore) {
                let sp = await transactionalEntityManager.findOne(
                  StoreProduct,
                  {
                    where: {
                      store: { storeID: centralStore.storeID },
                      variation: { variationID: variation.variationID },
                    },
                  },
                );

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

          for (const [sku, variation] of existingVariationsMap) {
            await transactionalEntityManager.remove(variation);
          }
        }

        return this.findOne(id);
      },
    );
  }

  async remove(id: string): Promise<void> {
    const product = await this.findOne(id);
    await this.productRepository.remove(product);
  }
}
