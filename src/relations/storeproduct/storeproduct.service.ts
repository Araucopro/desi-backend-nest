import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { StoreProduct } from './entities/storeproduct.entity';
import { Product } from '../../products/entities/product.entity';
import { DiscountType } from '../../pricing/entities/special-offer.entity';
import { LessThanOrEqual, MoreThanOrEqual, IsNull } from 'typeorm';
import { TransferStockDto } from './dto/transfer-stock.dto';
import { UpdateStoreProductDto } from './dto/update-store-product.dto';
import { ProductVariation } from '../../products/entities/product-variation.entity';
import { Store } from '../../stores/entities/store.entity';
import { PricingService } from '../../pricing/pricing.service';

@Injectable()
export class StoreProductService {
  constructor(
    @InjectRepository(StoreProduct)
    private readonly storeStockRepository: Repository<StoreProduct>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    private readonly dataSource: DataSource,
    @Optional() private readonly pricingService?: PricingService,
  ) {}

  async transferStock(transferStockDto: TransferStockDto): Promise<void> {
    const { targetStoreID, items } = transferStockDto;

    await this.dataSource.transaction(async (manager) => {
      // 1. Verificar tienda destino
      const targetStore = await manager.findOne(Store, {
        where: { storeID: targetStoreID },
      });
      if (!targetStore) {
        throw new NotFoundException(
          `Tienda destino con ID ${targetStoreID} no encontrada`,
        );
      }

      // 2. Procesar cada item
      for (const item of items) {
        const { variationID, stock, priceCost } = item;
        let sourcePriceList = priceCost;

        // Validar que exista la variación (para asegurar integridad)
        const variation = await manager.findOne(ProductVariation, {
          where: { variationID },
        });

        if (!variation) {
          throw new NotFoundException(
            `Variación con ID ${variationID} no encontrada`,
          );
        }

        // --- LÓGICA DE TRANSFERENCIA ---
        // 1. Descontar de la Tienda Central (Ahora usando StoreProduct)
        const centralStore = await manager.findOne(Store, {
          where: { isCentralStore: true },
        });

        if (centralStore) {
          const centralStock = await manager.findOne(StoreProduct, {
            where: {
              store: { storeID: centralStore.storeID },
              variation: { variationID },
            },
            lock: { mode: 'pessimistic_write' },
          });

          if (!centralStock) {
            throw new BadRequestException(
              `No hay stock en central para la variación ${variationID}`,
            );
          }

          if (centralStock.stock < stock) {
            throw new BadRequestException(
              `Stock insuficiente en central. Solicitado: ${stock}, Disponible: ${centralStock.stock}`,
            );
          }

          sourcePriceList = centralStock.priceList ?? priceCost;
          centralStock.stock -= stock;
          await manager.save(centralStock);
        } else {
          // Fallback si no hay central store definida? O error?
          // Asumimos que siempre debe haber una central para sacar stock.
          throw new BadRequestException(
            'No se encontró una tienda central para descontar stock.',
          );
        }

        // 2. Agregar a Franquicia (StoreProduct)
        let storeStock = await manager.findOne(StoreProduct, {
          where: {
            store: { storeID: targetStoreID },
            variation: { variationID },
          },
        });

        if (!storeStock) {
          storeStock = manager.create(StoreProduct, {
            store: { storeID: targetStoreID },
            variation: { variationID },
            priceCost,
            stock: 0,
            priceList: sourcePriceList,
          });
        }

        storeStock.stock += stock;
        // Actualizamos costo si es relevante (promedio ponderado o último precio?)
        // Por simplicidad, actualizamos al último costo de transferencia.
        storeStock.priceCost = priceCost;
        if (
          (storeStock.priceList === undefined ||
            storeStock.priceList === null ||
            storeStock.priceList <= 0) &&
          sourcePriceList > 0
        ) {
          storeStock.priceList = sourcePriceList;
        }

        await manager.save(storeStock);
      }
    });
  }

  async getStoreInventory(storeID: string): Promise<Product[]> {
    const products = await this.productRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .innerJoinAndSelect('product.variations', 'variations')
      .innerJoinAndSelect(
        'variations.storeProducts',
        'storeProducts',
        'storeProducts.storeID = :storeID',
        { storeID },
      )
      .leftJoinAndSelect('storeProducts.store', 'store')
      .leftJoinAndSelect(
        'storeProducts.specialOffers',
        'offer',
        '(offer.isActive = :isActive AND (offer.endDate IS NULL OR offer.endDate >= :now) AND offer.startDate <= :now)',
        { isActive: true, now: new Date() },
      )
      .getMany();

    // Calculate final prices
    for (const product of products) {
      for (const variation of product.variations) {
        for (const sp of variation.storeProducts) {
          // Use centralized pricing service to compute final price
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
              // If pricing fails (e.g., margin violation), attach error info and continue so UI can show problem
              (sp as any).pricingError = e.message || 'Error calculando precio';
            }
          } else {
            // Fallback to local simple calculation (pre-change behavior)
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

  async update(
    id: string,
    updateStoreProductDto: UpdateStoreProductDto,
  ): Promise<StoreProduct> {
    const storeProduct = await this.storeStockRepository.findOne({
      where: { storeProductID: id },
    });

    if (!storeProduct) {
      throw new NotFoundException(
        `Producto de tienda con ID ${id} no encontrado`,
      );
    }

    // Actualizar campos permitidos
    if (updateStoreProductDto.stock !== undefined) {
      storeProduct.stock = updateStoreProductDto.stock;
    }
    if (updateStoreProductDto.priceCost !== undefined) {
      storeProduct.priceCost = updateStoreProductDto.priceCost;
    }
    if (updateStoreProductDto.priceList !== undefined) {
      storeProduct.priceList = updateStoreProductDto.priceList;
    }

    return this.storeStockRepository.save(storeProduct);
  }
}
