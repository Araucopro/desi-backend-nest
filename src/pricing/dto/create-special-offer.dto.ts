import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  IsDateString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  DiscountType,
  DiscountScope,
  OfferTargetScope,
} from '../entities/special-offer.entity';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSpecialOfferBundleItemDto {
  @ApiProperty({ description: 'ID del producto requerido en el bundle' })
  @IsUUID()
  productID!: string;

  @ApiPropertyOptional({
    description: 'Cantidad requerida de este producto en cada set',
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  requiredQuantity?: number;
}

export class CreateSpecialOfferDto {
  @ApiPropertyOptional({
    description:
      'ID del producto en la tienda (StoreProduct). Obligatorio para targetScope VARIATION.',
  })
  @IsOptional()
  @IsUUID()
  storeProductID?: string;

  @ApiPropertyOptional({
    description:
      'Alcance de la oferta. Default VARIATION para compatibilidad con ofertas legacy.',
    enum: OfferTargetScope,
    default: OfferTargetScope.VARIATION,
  })
  @IsOptional()
  @IsEnum(OfferTargetScope)
  targetScope?: OfferTargetScope;

  @ApiPropertyOptional({
    description:
      'Tienda en la que aplica la oferta. Requerido para alcances nuevos (STORE, PRODUCT, CATEGORY, BRAND, MODEL).',
  })
  @IsOptional()
  @IsUUID()
  storeID?: string;

  @ApiPropertyOptional({
    description: 'Productos seleccionados para alcance PRODUCT (uno o varios).',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  productIDs?: string[];

  @ApiPropertyOptional({
    description: 'Categoría para alcance CATEGORY.',
  })
  @IsOptional()
  @IsUUID()
  categoryID?: string;

  @ApiPropertyOptional({
    description: 'Incluir subcategorías en alcance CATEGORY. Default true.',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  includeSubcategories?: boolean;

  @ApiPropertyOptional({
    description: 'Marca exacta para alcance BRAND.',
  })
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiPropertyOptional({
    description: 'Modelo para alcance MODEL. Se compara con Product.name.',
  })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional({
    description:
      'Cantidad que se debe comprar para BUY_X_GET_Y (ej: 2 para 2x1).',
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  buyQuantity?: number;

  @ApiPropertyOptional({
    description: 'Cantidad que se paga en BUY_X_GET_Y (ej: 1 para 2x1).',
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  payQuantity?: number;

  @ApiPropertyOptional({
    description:
      'Prioridad de apilamiento. Menor valor se aplica primero. Default 0.',
    default: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  priority?: number;

  @ApiPropertyOptional({
    description:
      'Items del bundle para discountType BUNDLE (mínimo 2 productos).',
    type: [CreateSpecialOfferBundleItemDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSpecialOfferBundleItemDto)
  bundleItems?: CreateSpecialOfferBundleItemDto[];

  @ApiProperty({
    description: 'Descripción o motivo de la oferta',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    enum: DiscountType,
    description:
      'Tipo de descuento: PERCENTAGE, FIXED_AMOUNT, FIXED_PRICE, BUY_X_GET_Y, BUNDLE',
  })
  @IsEnum(DiscountType)
  discountType: DiscountType;

  @ApiProperty({ description: 'Valor numérico del descuento o precio final' })
  @IsNumber()
  value: number;

  @ApiProperty({
    description:
      'Ámbito del descuento: UNIT (por unidad) o TOTAL (sobre el total)',
    enum: DiscountScope,
    required: false,
  })
  @IsOptional()
  @IsEnum(DiscountScope)
  scope?: DiscountScope;

  @ApiProperty({
    description: 'Si la oferta es exclusiva (impide descuentos manuales)',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  exclusive?: boolean;

  @ApiProperty({
    description: 'Fecha de inicio de la oferta',
    example: '2024-01-01T00:00:00Z',
  })
  @IsDateString()
  startDate: string;

  @ApiProperty({
    description: 'Fecha de término de la oferta (opcional)',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiProperty({
    description: 'Si la oferta está activa o no',
    default: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
