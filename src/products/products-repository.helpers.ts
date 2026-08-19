import { NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Store } from '../stores/entities/store.entity';
import { CreateProductVariationDto } from './dto/create-product-variation.dto';
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
