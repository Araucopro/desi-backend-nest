import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class CalculatePriceDto {
  @ApiProperty({ description: 'ID del producto en tienda (StoreProduct)' })
  @IsUUID()
  storeProductID: string;

  @ApiPropertyOptional({
    description: 'Cantidad de unidades a calcular',
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  quantity?: number;

  @ApiPropertyOptional({
    description: 'ID del usuario que solicita un descuento manual',
  })
  @IsOptional()
  @IsUUID()
  userID?: string;

  @ApiPropertyOptional({
    description: 'Descuento manual porcentual a aplicar (0-100)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  manualDiscount?: number;

  @ApiPropertyOptional({
    description: 'Precio base por unidad precargado desde otro flujo',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  baseUnitPrice?: number;

  @ApiPropertyOptional({
    description: 'Costo por unidad precargado desde otro flujo',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  priceCost?: number;

  @ApiPropertyOptional({
    description: 'Fecha de pricing a utilizar en el cálculo',
    example: '2026-04-15T12:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  pricingDate?: string;
}
