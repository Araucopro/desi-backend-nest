import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, Min } from 'class-validator';

export class UpdateStoreProductDto {
  @ApiProperty({
    description: 'Cantidad de stock disponible',
    example: 100,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  stock?: number;

  @ApiProperty({
    description: 'Precio de costo del producto para la tienda',
    example: 10.5,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  priceCost?: number;

  @ApiProperty({
    description: 'Precio de venta al público en la tienda',
    example: 20.0,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  priceList?: number;
}
