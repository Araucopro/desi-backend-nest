import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { In } from 'typeorm';
import { TenantContextService } from '../multitenant/tenant-context.service';
import { PricingService } from '../pricing/pricing.service';
import { StoreProductService } from '../relations/storeproduct/storeproduct.service';
import { StoreProduct } from '../relations/storeproduct/entities/storeproduct.entity';
import { Store } from '../stores/entities/store.entity';
import {
  meetsChannelPhotoPolicy,
  productImages,
  isProductImageUrl,
} from '../products/product-images';
import { CommerceQuoteDto } from './dto/quote.dto';

type PricedStoreProduct = StoreProduct & {
  finalPrice?: number;
  pricingError?: string;
};

@Injectable()
export class CommerceService {
  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly inventory: StoreProductService,
    private readonly pricing: PricingService,
  ) {}

  async context(storeId: string) {
    const tenantId = this.tenantContext.getTenantId();
    const store = await this.tenantContext.transaction((manager) =>
      manager.getRepository(Store).findOne({
        where: { storeID: storeId, tenantID: tenantId },
        select: ['storeID', 'tenantID', 'name'],
      }),
    );
    if (!store)
      throw new ForbiddenException('Channel store does not belong to tenant');
    return {
      tenantID: tenantId,
      storeID: store.storeID,
      storeName: store.name,
    };
  }

  async catalog(storeId: string, requireProductPhoto = true) {
    await this.context(storeId);
    const products = await this.inventory.getStoreInventory(storeId);
    return products
      .filter((product) =>
        meetsChannelPhotoPolicy(product, requireProductPhoto),
      )
      .map((product) => ({
        productID: product.productID,
        slug: product.slug?.trim() || `producto-${product.productID}`,
        name: product.name,
        brand: product.brand ?? null,
        description: product.description?.trim() || null,
        image: productImages(product.image)
          .filter(isProductImageUrl)
          .slice(0, 5)
          .join(', '),
        category: product.category?.name ?? null,
        variants: (product.variations ?? []).flatMap((variation) =>
          (variation.storeProducts ?? []).map((raw) => {
            const storeProduct = raw as PricedStoreProduct;
            return {
              variationID: variation.variationID,
              storeProductID: storeProduct.storeProductID,
              sku: variation.sku,
              size: variation.variation ?? null,
              color: variation.subVariation ?? null,
              stock: Math.max(0, Number(storeProduct.stock)),
              compareAtPrice:
                !storeProduct.pricingError &&
                storeProduct.finalPrice !== undefined &&
                Number(storeProduct.priceList) > storeProduct.finalPrice
                  ? Number(storeProduct.priceList)
                  : null,
              price: storeProduct.pricingError
                ? null
                : (storeProduct.finalPrice ?? null),
            };
          }),
        ),
      }));
  }

  async quote(
    storeId: string,
    dto: CommerceQuoteDto,
    requireProductPhoto = true,
  ) {
    await this.context(storeId);
    const quantities = new Map<string, number>();
    for (const item of dto.items) {
      const quantity =
        (quantities.get(item.storeProductID) ?? 0) + item.quantity;
      if (quantity > 100)
        throw new BadRequestException('Quantity limit exceeded');
      quantities.set(item.storeProductID, quantity);
    }
    const items = [...quantities].map(([storeProductID, quantity]) => ({
      storeProductID,
      quantity,
    }));
    const pricing = await this.pricing.calculateCart({
      storeID: storeId,
      items,
    });
    const stock = await this.tenantContext.transaction((manager) =>
      manager.getRepository(StoreProduct).find({
        where: {
          storeProductID: In([...quantities.keys()]),
          store: { storeID: storeId },
        },
        relations: { variation: { product: true } },
      }),
    );
    if (stock.length !== items.length)
      throw new NotFoundException('Product outside channel store');
    if (
      stock.some(
        (item) =>
          !item.variation?.product ||
          !meetsChannelPhotoPolicy(item.variation.product, requireProductPhoto),
      )
    ) {
      throw new BadRequestException(
        'Product is no longer available on the website',
      );
    }
    const productsById = new Map(
      stock.map((item) => [item.storeProductID, item.variation]),
    );
    const stockById = new Map(
      stock.map((item) => [item.storeProductID, Number(item.stock)]),
    );
    return {
      items: pricing.items.map((item) => ({
        storeProductID: item.storeProductID,
        quantity: item.quantity,
        sku: item.sku,
        name: productsById.get(item.storeProductID)?.product.name ?? item.sku,
        image:
          productImages(
            productsById.get(item.storeProductID)?.product.image,
          ).find(isProductImageUrl) ?? null,
        size: productsById.get(item.storeProductID)?.variation ?? null,
        color: productsById.get(item.storeProductID)?.subVariation ?? null,
        unitPrice: item.finalUnitPrice,
        lineTotal: item.lineTotal,
        available: (stockById.get(item.storeProductID) ?? 0) >= item.quantity,
      })),
      totals: pricing.totals,
      quotedAt: new Date().toISOString(),
    };
  }
}
