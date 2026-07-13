import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  IsDateString,
  IsBoolean,
} from 'class-validator';
import { DiscountType, DiscountScope } from '../entities/special-offer.entity';
import { ApiProperty } from '@nestjs/swagger';

export class CreateSpecialOfferDto {
  @ApiProperty({ description: 'ID del producto en la tienda (StoreProduct)' })
  @IsUUID()
  storeProductID: string;

  @ApiProperty({
    description: 'Descripción o motivo de la oferta',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    enum: DiscountType,
    description: 'Tipo de descuento: PERCENTAGE, FIXED_AMOUNT, FIXED_PRICE',
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
