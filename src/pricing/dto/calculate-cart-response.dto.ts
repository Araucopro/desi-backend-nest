import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DiscountScope } from '../entities/special-offer.entity';
import { StoreType } from '../../stores/entities/store.entity';

export class BreakdownEntryDto {
  @ApiProperty({
    description:
      'Etapa del cálculo (basePrice, oferta, descuento manual, etc.)',
    example: 'basePrice',
  })
  step!: string;

  @ApiProperty({
    description: 'Precio de la línea antes de esta etapa',
    example: 10000,
  })
  previousPrice!: number;

  @ApiProperty({
    description: 'Precio de la línea después de esta etapa',
    example: 9500,
  })
  newPrice!: number;

  @ApiProperty({
    description: 'Variación de precio en la etapa (puede ser negativa)',
    example: -500,
  })
  delta!: number;

  @ApiProperty({
    description: 'Alcance del descuento',
    enum: DiscountScope,
    example: DiscountScope.TOTAL,
  })
  scope!: DiscountScope | string;

  @ApiPropertyOptional({
    description: 'Detalles adicionales de la etapa',
    type: 'object',
    additionalProperties: true,
  })
  details?: Record<string, unknown>;
}

export class AppliedDiscountDto {
  @ApiProperty({
    description: 'Origen del descuento',
    enum: ['AUTO', 'MANUAL'],
    example: 'AUTO',
  })
  source!: 'AUTO' | 'MANUAL';

  @ApiProperty({
    description: 'Indica si el descuento se aplicó efectivamente',
    example: true,
  })
  applied!: boolean;

  @ApiProperty({
    description: 'Precio de la línea antes del descuento',
    example: 10000,
  })
  previousPrice!: number;

  @ApiProperty({
    description: 'Precio de la línea después del descuento',
    example: 8000,
  })
  resultingPrice!: number;

  @ApiProperty({
    description: 'Alcance del descuento',
    enum: DiscountScope,
    example: DiscountScope.TOTAL,
  })
  scope!: DiscountScope | 'TOTAL';

  @ApiPropertyOptional({
    description: 'ID de la oferta aplicada',
    example: 'offer-uuid',
  })
  offerID?: string;

  @ApiPropertyOptional({
    description: 'Descripción del descuento',
    example: '20% off',
  })
  description?: string;

  @ApiPropertyOptional({
    description: 'Tipo de descuento',
    example: 'PERCENTAGE',
  })
  discountType?: string;

  @ApiPropertyOptional({
    description: 'Valor del descuento',
    example: 2000,
  })
  value?: number;

  @ApiPropertyOptional({
    description: 'Porcentaje de descuento manual (0-100)',
    example: 10,
  })
  manualDiscount?: number;

  @ApiPropertyOptional({
    description: 'Indica si la oferta es exclusiva',
    example: false,
  })
  exclusive?: boolean;

  @ApiPropertyOptional({
    description: 'Razón por la que el descuento no se aplicó',
    example: 'Oferta exclusiva activa',
  })
  reasonIgnored?: string;

  @ApiPropertyOptional({
    description: 'Prioridad de la oferta',
    example: 10,
  })
  priority?: number;

  @ApiPropertyOptional({
    description: 'Detalles adicionales del descuento',
    type: 'object',
    additionalProperties: true,
  })
  details?: Record<string, unknown>;
}

export class CartPricingItemDto {
  @ApiProperty({
    description: 'ID del producto en tienda (StoreProduct)',
    example: 'store-product-uuid',
  })
  storeProductID!: string;

  @ApiProperty({
    description: 'ID de la variación',
    example: 'variation-uuid',
  })
  variationID!: string;

  @ApiProperty({ description: 'ID del producto', example: 'product-uuid' })
  productID!: string;

  @ApiProperty({
    description: 'Nombre del producto',
    example: 'Cemento 25kg',
  })
  productName!: string;

  @ApiProperty({ description: 'SKU de la variación', example: 'CEM-25' })
  sku!: string;

  @ApiProperty({ description: 'Cantidad de unidades', example: 2 })
  quantity!: number;

  @ApiProperty({
    description: 'Precio base por unidad (antes de ofertas)',
    example: 7990,
  })
  baseUnitPrice!: number;

  @ApiProperty({ description: 'Costo unitario', example: 5000 })
  unitCost!: number;

  @ApiProperty({
    description: 'Precio base de la línea (cantidad × precio base)',
    example: 15980,
  })
  basePrice!: number;

  @ApiProperty({
    description: 'Precio final por unidad tras descuentos',
    example: 7191,
  })
  finalUnitPrice!: number;

  @ApiProperty({
    description: 'Total de la línea tras descuentos',
    example: 14382,
  })
  lineTotal!: number;

  @ApiProperty({
    type: [AppliedDiscountDto],
    description: 'Descuentos evaluados/aplicados en la línea',
  })
  discountsApplied!: AppliedDiscountDto[];

  @ApiProperty({
    type: [BreakdownEntryDto],
    description: 'Desglose paso a paso del cálculo de la línea',
  })
  breakdown!: BreakdownEntryDto[];
}

export class CartTotalsDto {
  @ApiProperty({
    description: 'Subtotal del carrito (suma de precios base)',
    example: 23970,
  })
  subtotal!: number;

  @ApiProperty({
    description: 'Descuento total aplicado (subtotal - total, nunca negativo)',
    example: 2400,
  })
  discount!: number;

  @ApiProperty({
    description: 'Total final del carrito a cobrar',
    example: 21570,
  })
  total!: number;
}

export class CartPricingContextDto {
  @ApiProperty({
    description: 'Fecha usada para resolver ofertas (ISO 8601)',
    example: '2026-08-18T12:00:00.000Z',
  })
  pricingDate!: string;

  @ApiPropertyOptional({
    description: 'ID de la tienda del carrito',
    example: 'store-uuid',
  })
  storeID?: string;

  @ApiPropertyOptional({
    description: 'ID del producto (presente en cálculo unitario)',
    example: 'product-uuid',
  })
  productID?: string;

  @ApiPropertyOptional({
    description: 'ID de la variación (presente en cálculo unitario)',
    example: 'variation-uuid',
  })
  variationID?: string;

  @ApiPropertyOptional({
    description: 'Tipo de tienda',
    enum: StoreType,
  })
  storeType?: StoreType;
}

export class CalculateCartResponseDto {
  @ApiProperty({
    type: [CartPricingItemDto],
    description: 'Líneas calculadas del carrito',
  })
  items!: CartPricingItemDto[];

  @ApiProperty({
    type: CartTotalsDto,
    description: 'Totales del carrito',
  })
  totals!: CartTotalsDto;

  @ApiProperty({
    type: CartPricingContextDto,
    description: 'Contexto usado en el cálculo',
  })
  pricingContext!: CartPricingContextDto;
}
