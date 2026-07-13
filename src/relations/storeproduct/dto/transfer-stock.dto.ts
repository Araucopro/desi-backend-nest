import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

class StockTransferItemDto {
  @ApiProperty({
    description: 'ID de la variación del producto a transferir',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  @IsNotEmpty()
  variationID!: string;

  @ApiProperty({
    description: 'Cantidad de unidades a transferir',
    example: 5,
    minimum: 1,
  })
  @IsInt()
  @IsPositive()
  stock!: number;

  @ApiProperty({
    description:
      'Costo de compra por unidad (precio al que la tienda adquiere el producto)',
    example: 12000,
    minimum: 0,
  })
  @IsNumber()
  @IsPositive()
  priceCost!: number;
}

export class TransferStockDto {
  @ApiProperty({
    description: 'ID de la tienda que recibirá el stock',
    example: '123e4567-e89b-12d3-a456-426614174001',
  })
  @IsUUID()
  @IsNotEmpty()
  targetStoreID!: string;

  @ApiProperty({
    type: [StockTransferItemDto],
    description: 'Lista de productos y cantidades a transferir',
    example: [
      {
        variationID: '123e4567-e89b-12d3-a456-426614174000',
        quantity: 5,
        purchaseCost: 12000,
      },
    ],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StockTransferItemDto)
  items!: StockTransferItemDto[];
}
