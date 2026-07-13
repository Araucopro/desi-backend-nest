import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsNumber,
  Min,
  IsOptional,
  IsPositive,
} from 'class-validator';

export class CreateProductVariationDto {
  @ApiProperty({
    description: 'Código SKU único que identifica esta variación del producto',
    example: 'CAM-ROJ-L-001',
  })
  @IsString()
  @IsNotEmpty()
  sku!: string;

  @ApiProperty({
    description:
      'Precio de costo de la variación (lo que cuesta producir/comprar)',
    example: 15000,
    minimum: 0,
  })
  @IsNumber()
  @IsPositive()
  priceCost!: number;

  @ApiProperty({
    description: 'Precio de lista o venta sugerido al público',
    example: 25000,
    minimum: 0,
  })
  @IsNumber()
  @IsPositive()
  priceList!: number;

  @ApiProperty({
    description: 'Cantidad de stock disponible en la tienda central',
    example: 100,
    minimum: 0,
  })
  @IsNumber()
  @Min(0)
  stock!: number;

  @ApiProperty({
    description: 'Color de la variante',
    example: 'Rojo',
    required: false,
  })
  @IsString()
  @IsOptional()
  color?: string;

  @ApiProperty({
    description: 'Talla de la variante',
    example: 'L',
    required: false,
  })
  @IsString()
  @IsOptional()
  size?: string;
}
