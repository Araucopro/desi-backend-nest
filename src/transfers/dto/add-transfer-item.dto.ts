import { IsInt, IsNotEmpty, IsPositive, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddTransferItemDto {
  @ApiProperty({
    description: 'ID de la variante del producto a transferir',
    example: 'd8c7e96b-8d74-4b4e-9d8a-987654321012',
  })
  @IsUUID()
  @IsNotEmpty()
  variationID: string;

  @ApiProperty({
    description: 'Cantidad de unidades a transferir',
    example: 10,
    minimum: 1,
  })
  @IsInt()
  @IsPositive()
  @IsNotEmpty()
  quantity: number;
}
