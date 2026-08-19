import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StoreType } from '../../stores/entities/store.entity';
import {
  AppliedDiscountDto,
  BreakdownEntryDto,
} from './calculate-cart-response.dto';

export class PricingContextDto {
  @ApiProperty({
    description: 'Fecha usada para resolver ofertas (ISO 8601)',
    example: '2026-08-18T12:00:00.000Z',
  })
  pricingDate!: string;

  @ApiPropertyOptional({
    description: 'ID de la tienda del cálculo',
    example: 'store-uuid',
  })
  storeID?: string;

  @ApiPropertyOptional({
    description: 'ID del producto',
    example: 'product-uuid',
  })
  productID?: string;

  @ApiPropertyOptional({
    description: 'ID de la variación',
    example: 'variation-uuid',
  })
  variationID?: string;

  @ApiPropertyOptional({
    description: 'Tipo de tienda',
    enum: StoreType,
  })
  storeType?: StoreType;
}

export class PricingResultDto {
  @ApiProperty({
    description: 'Precio base por unidad antes de descuentos',
    example: 10000,
  })
  basePrice!: number;

  @ApiProperty({
    description: 'Precio final por unidad tras descuentos',
    example: 8000,
  })
  finalPrice!: number;

  @ApiProperty({
    type: [BreakdownEntryDto],
    description: 'Desglose paso a paso del cálculo',
  })
  breakdown!: BreakdownEntryDto[];

  @ApiProperty({
    description: 'Indica si se aplicó al menos un descuento',
    example: true,
  })
  discountApplied!: boolean;

  @ApiProperty({
    type: [AppliedDiscountDto],
    description: 'Descuentos evaluados/aplicados',
  })
  discountsApplied!: AppliedDiscountDto[];

  @ApiPropertyOptional({
    type: AppliedDiscountDto,
    nullable: true,
    description: 'Mejor oferta aplicada o null si no hay oferta activa',
  })
  discountDetails?: AppliedDiscountDto | null;

  @ApiProperty({
    type: PricingContextDto,
    description: 'Contexto usado en el cálculo',
  })
  pricingContext!: PricingContextDto;
}
