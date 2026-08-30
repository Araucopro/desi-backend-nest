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
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
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
    const qb = this.productRepository
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

    for (const product of products) {
      for (const variation of product.variations) {
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
          } catch (e) {
            (sp as any).pricingError =
              (e as Error)?.message || 'Error calculando precio';
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
