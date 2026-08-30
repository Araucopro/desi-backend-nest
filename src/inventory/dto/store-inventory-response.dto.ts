import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class StoreInventoryProductDto {
  @ApiProperty({
    description: 'ID del producto',
    example: 'product-uuid',
  })
  productID!: string;

  @ApiProperty({
    description: 'Nombre del producto',
    example: 'Cemento 25kg',
  })
  name!: string;

  @ApiPropertyOptional({
    description: 'Marca del producto',
    example: 'Marca',
  })
  brand?: string;

  @ApiPropertyOptional({
    description: 'Descripción del producto',
  })
  description?: string;

  @ApiPropertyOptional({
    description: 'Género o línea del producto',
    example: 'Unisex',
  })
  genre?: string;

  @ApiPropertyOptional({
    description: 'URL de la imagen del producto',
  })
  image?: string;

  @ApiPropertyOptional({
    description: 'ID de la categoría del producto',
    example: 'category-uuid',
  })
  categoryID?: string;

  @ApiProperty({
    description: 'Fecha de creación en formato ISO 8601',
    type: Date,
    example: '2026-08-18T12:00:00.000Z',
  })
  createdAt!: Date;

  @ApiProperty({
    description: 'Fecha de actualización en formato ISO 8601',
    type: Date,
    example: '2026-08-18T12:00:00.000Z',
  })
  updatedAt!: Date;
}

export class StoreInventoryVariationDto {
  @ApiProperty({
    description: 'ID de la variación',
    example: 'variation-uuid',
  })
  variationID!: string;

  @ApiProperty({
    description: 'SKU de la variación',
    example: 'CEM-25',
  })
  sku!: string;

  @ApiPropertyOptional({
    description: 'Color de la variación',
    example: 'Gris',
  })
  color?: string;

  @ApiPropertyOptional({
    description: 'Talla de la variación',
    example: 'M',
  })
  size?: string;

  @ApiPropertyOptional({
    description: 'SKU del proveedor',
    nullable: true,
  })
  supplierSku?: string | null;

  @ApiPropertyOptional({
    description:
      'Código de barras (EAN/UPC). Por defecto usa el SKU o el SKU del proveedor',
    nullable: true,
  })
  barcode?: string | null;

  @ApiProperty({
    type: StoreInventoryProductDto,
    description: 'Producto asociado a la variación',
  })
  product!: StoreInventoryProductDto;

  @ApiProperty({
    description: 'Fecha de creación en formato ISO 8601',
    type: Date,
    example: '2026-08-18T12:00:00.000Z',
  })
  createdAt!: Date;

  @ApiProperty({
    description: 'Fecha de actualización en formato ISO 8601',
    type: Date,
    example: '2026-08-18T12:00:00.000Z',
  })
  updatedAt!: Date;
}

export class StoreInventoryItemDto {
  @ApiProperty({
    description: 'ID del producto en tienda (StoreProduct)',
    example: 'store-product-uuid',
  })
  storeProductID!: string;

  @ApiProperty({
    description:
      'Stock actual (cache/read model derivado de InventoryMovements)',
    example: 12,
  })
  stock!: number;

  @ApiProperty({
    description: 'Precio de costo en CLP',
    example: 5000,
  })
  priceCost!: number;

  @ApiPropertyOptional({
    description: 'Precio de lista/venta en CLP',
    example: 7990,
    nullable: true,
  })
  priceList?: number;

  @ApiProperty({
    description: 'Fecha de creación en formato ISO 8601',
    type: Date,
    example: '2026-08-18T12:00:00.000Z',
  })
  createdAt!: Date;

  @ApiProperty({
    description: 'Fecha de actualización en formato ISO 8601',
    type: Date,
    example: '2026-08-18T12:00:00.000Z',
  })
  updatedAt!: Date;

  @ApiProperty({
    type: StoreInventoryVariationDto,
    description: 'Variación asociada al producto en tienda',
  })
  variation!: StoreInventoryVariationDto;
}
