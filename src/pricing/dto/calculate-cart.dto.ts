import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class CalculateCartItemDto {
  @ApiProperty({ description: 'ID del producto en tienda (StoreProduct)' })
  @IsUUID()
  storeProductID!: string;

  @ApiProperty({ description: 'Cantidad de unidades', minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;
}

export class CalculateCartDto {
  @ApiProperty({ description: 'ID de la tienda del carrito' })
  @IsUUID()
  storeID!: string;

  @ApiProperty({
    description: 'Ítems del carrito',
    type: [CalculateCartItemDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CalculateCartItemDto)
  items!: CalculateCartItemDto[];

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
    description: 'Fecha de pricing a utilizar en el cálculo',
    example: '2026-08-12T12:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  pricingDate?: string;
}
