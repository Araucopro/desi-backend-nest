import { NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Store } from '../stores/entities/store.entity';
import { CreateProductVariationDto } from './dto/create-product-variation.dto';
import { ProductListQueryDto } from './dto/product-list.query.dto';
import { Product } from './entities/product.entity';
import { ProductVariation } from './entities/product-variation.entity';

export async function findProductForUpdate(
  manager: EntityManager,
  productID: string,
  relations: string[] = ['variations'],
): Promise<Product> {
  const product = await manager.findOne(Product, {
    where: { productID },
    lock: { mode: 'pessimistic_write' },
  });

  if (!product) {
    throw new NotFoundException(`Producto con ID ${productID} no encontrado`);
  }

  // PostgreSQL prohíbe FOR UPDATE sobre el lado nullable de un outer join,
  // por lo que las relaciones se cargan después del lock, sin joins bloqueados.
  const productWithRelations = await manager.findOne(Product, {
    where: { productID },
    relations,
  });

  if (!productWithRelations) {
    throw new NotFoundException(`Producto con ID ${productID} no encontrado`);
  }

  return productWithRelations;
}

export async function findCentralStore(
  manager: EntityManager,
  tenantID?: string,
): Promise<Store | null> {
  return manager.findOne(Store, {
    where: {
      isCentralStore: true,
      ...(tenantID ? { tenantID } : {}),
    },
  });
}

export async function findProductsPaginated(
  manager: EntityManager,
  filters: ProductListQueryDto,
): Promise<[Product[], number]> {
  const {
    limit = 10,
    offset = 0,
    search,
    barcode,
    categoryID,
    genre,
  } = filters;

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

  return qb.take(limit).skip(offset).getManyAndCount();
}

export async function findProductWithRelations(
  manager: EntityManager,
  productID: string,
  relations: string[] = [
    'variations',
    'variations.storeProducts',
    'variations.storeProducts.store',
    'category',
  ],
): Promise<Product | null> {
  return manager.findOne(Product, {
    where: { productID },
    relations,
  });
}

export async function saveProduct(
  manager: EntityManager,
  product: Product,
): Promise<Product> {
  return manager.save(product);
}

export async function saveVariation(
  manager: EntityManager,
  variation: ProductVariation,
): Promise<ProductVariation> {
  return manager.save(variation);
}

export async function deleteProductById(
  manager: EntityManager,
  productID: string,
): Promise<void> {
  const product = await manager.findOne(Product, {
    where: { productID },
  });
  if (!product) {
    throw new NotFoundException(`Producto con ID ${productID} no encontrado`);
  }
  await manager.getRepository(Product).remove(product);
}

export function createProductEntity(
  manager: EntityManager,
  values: {
    name: string;
    tenantID?: string;
    categoryID?: string;
    image?: string;
    brand?: string;
    genre?: Product['genre'];
    description?: string;
  },
): Product {
  return manager.create(Product, {
    ...values,
    ...(values.tenantID ? { tenantID: values.tenantID } : {}),
  });
}

export function createVariationEntity(
  manager: EntityManager,
  values: {
    dto: CreateProductVariationDto;
    product: Product;
    tenantID?: string;
  },
): ProductVariation {
  const { barcode, ...dto } = values.dto;
  return manager.create(ProductVariation, {
    ...dto,
    barcode: barcode?.trim() ? barcode : dto.supplierSku?.trim() || dto.sku,
    product: values.product,
    ...(values.tenantID ? { tenantID: values.tenantID } : {}),
  });
}
