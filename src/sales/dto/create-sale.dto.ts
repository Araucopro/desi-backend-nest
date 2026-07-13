import {
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

class SaleProductItemDto {
  @ApiProperty({
    description: 'ID de la variación del producto a vender',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  @IsNotEmpty()
  variationID: string;

  @ApiProperty({
    description: 'Cantidad de unidades a vender',
    example: 10,
    minimum: 1,
  })
  @IsInt()
  @IsPositive()
  quantity: number;

  @ApiProperty({
    description: 'Precio unitario de venta',
    example: 15000,
    minimum: 0,
  })
  @IsNumber()
  @IsPositive()
  unitPrice: number;
}

export class CreateSaleDto {
  @ApiProperty({
    description: 'ID de la tienda que realiza la compra',
    example: '123e4567-e89b-12d3-a456-426614174001',
  })
  @IsUUID()
  @IsNotEmpty()
  storeID: string;

  @ApiProperty({
    enum: ['Efectivo', 'Debito', 'Credito'],
    description: 'Método de pago utilizado para la transacción',
    example: 'Credito',
  })
  @IsEnum(['Efectivo', 'Debito', 'Credito'])
  paymentType: 'Efectivo' | 'Debito' | 'Credito';

  @ApiProperty({
    type: [SaleProductItemDto],
    description: 'Lista de productos y cantidades a vender',
    example: [
      {
        variationID: '123e4567-e89b-12d3-a456-426614174000',
        quantity: 10,
        unitPrice: 15000,
      },
    ],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaleProductItemDto)
  items: SaleProductItemDto[];
}
