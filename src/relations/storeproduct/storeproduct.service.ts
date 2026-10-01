import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { StoreProduct } from './entities/storeproduct.entity';
import { Product } from '../../products/entities/product.entity';
import { UpdateStoreProductDto } from './dto/update-store-product.dto';
import { PricingService } from '../../pricing/pricing.service';
import { PriceType } from '../../pricing/entities/price-history.entity';
import { InventoryMovementReason } from '../../inventory/entities/inventory-movement.entity';
import {
  applyInventoryMovement,
  findStoreProductByIdForUpdate,
} from '../../inventory/inventory-repository.helpers';
import { TenantContextService } from '../../multitenant/tenant-context.service';
import { TransactionRunnerService } from '../../common/services/transaction-runner.service';

@Injectable()
export class StoreProductService {
  constructor(
    @InjectRepository(StoreProduct)
    private readonly storeStockRepository: Repository<StoreProduct>,
    private readonly dataSource: DataSource,
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
      : this.dataSource.transaction(callback);
  }

  async getStoreInventory(
    storeID: string,
    search?: string,
    barcode?: string,
  ): Promise<Product[]> {
    return this.runInTransaction(async (manager) => {
      const qb = manager
        .getRepository(Product)
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
        );

      if (search?.trim()) {
        const term = `%${search.trim()}%`;
        qb.andWhere(
          '(product.name ILIKE :term OR product.brand ILIKE :term OR category.name ILIKE :term OR variations.sku ILIKE :term OR variations.supplierSku ILIKE :term OR variations.barcode ILIKE :term)',
          { term },
        );
      }

      if (barcode?.trim()) {
        qb.andWhere('variations.barcode = :barcode', {
          barcode: barcode.trim(),
        });
      }

      const products = await qb.getMany();
      const pricingTargets = products.flatMap((product) =>
        (product.variations ?? []).flatMap((variation) =>
          (variation.storeProducts ?? []).map((storeProduct) => ({
            storeProduct,
            variation,
            product,
          })),
        ),
      );

      try {
        const pricingResults =
          await this.pricingService.calculatePricesForProductList(
            manager,
            pricingTargets,
          );

        for (const { storeProduct } of pricingTargets) {
          const outcome = pricingResults.get(storeProduct.storeProductID);
          if (outcome?.result) {
            Object.assign(storeProduct, {
              finalPrice: outcome.result.finalPrice,
              discountApplied: outcome.result.discountApplied,
              discountsApplied: outcome.result.discountsApplied ?? [],
              activeOffer: outcome.result.discountDetails,
              pricingBreakdown: outcome.result.breakdown,
            });
          } else {
            Object.assign(storeProduct, {
              pricingError: outcome?.error || 'Error calculando precio',
            });
          }
        }
      } catch (error) {
        const message =
          error instanceof Error && error.message
            ? error.message
            : 'Error calculando precio';
        for (const { storeProduct } of pricingTargets) {
          Object.assign(storeProduct, { pricingError: message });
        }
      }

      return products;
    });
  }

  async update(
    id: string,
    updateStoreProductDto: UpdateStoreProductDto,
  ): Promise<StoreProduct> {
    return this.runInTransaction(async (manager) => {
      const storeProduct = await findStoreProductByIdForUpdate(manager, id);

      if (!storeProduct) {
        throw new NotFoundException(
          `Producto de tienda con ID ${id} no encontrado`,
        );
      }

      let current = storeProduct;

      if (updateStoreProductDto.stock !== undefined) {
        const applied = await applyInventoryMovement(manager, {
          storeID: current.store.storeID,
          variationID: current.variation.variationID,
          reason: InventoryMovementReason.ADJUSTMENT,
          newStock: updateStoreProductDto.stock,
          referenceID: id,
          tenantID: current.tenantID,
          allowNegativeStock: true,
          createIfMissing: false,
          skipZeroDelta: true,
        });
        current = applied.storeProduct;
      }

      if (
        updateStoreProductDto.priceCost !== undefined &&
        updateStoreProductDto.priceCost !== current.priceCost
      ) {
        await this.pricingService.applyPriceChange(manager, current, {
          priceType: PriceType.COST,
          oldPrice: current.priceCost,
          newPrice: updateStoreProductDto.priceCost,
          reason: 'Actualización de producto en tienda',
        });
      }

      if (
        updateStoreProductDto.priceList !== undefined &&
        updateStoreProductDto.priceList !== current.priceList
      ) {
        await this.pricingService.applyPriceChange(manager, current, {
          priceType: PriceType.LIST,
          oldPrice: current.priceList ?? 0,
          newPrice: updateStoreProductDto.priceList,
          reason: 'Actualización de producto en tienda',
        });
      }

      return manager.save(current);
    });
  }
}
