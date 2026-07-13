import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { PriceType } from '../entities/price-history.entity';
import { ApiProperty } from '@nestjs/swagger';

export class UpdatePriceDto {
  @ApiProperty({ description: 'ID de la tienda' })
  @IsUUID()
  @IsNotEmpty()
  storeID!: string;

  @ApiProperty({ description: 'ID de la variación del producto' })
  @IsUUID()
  @IsNotEmpty()
  variationID!: string;

  @ApiProperty({
    enum: PriceType,
    description: 'Tipo de precio: COST (Costo) o LIST (Venta)',
  })
  @IsEnum(PriceType)
  @IsNotEmpty()
  priceType!: PriceType;

  @ApiProperty({ description: 'Nuevo valor del precio' })
  @IsNumber()
  @IsNotEmpty()
  newPrice!: number;

  @ApiProperty({ description: 'Razón del cambio de precio', required: false })
  @IsString()
  @IsOptional()
  reason?: string;

  @ApiProperty({
    description: 'Nombre o ID del usuario que realizó el cambio',
    required: false,
  })
  @IsString()
  @IsOptional()
  changedBy?: string;
}
