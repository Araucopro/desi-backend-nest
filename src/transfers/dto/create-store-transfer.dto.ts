import { IsNotEmpty, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateStoreTransferDto {
  @ApiProperty({
    description: 'ID de la tienda que envía los productos',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  @IsNotEmpty()
  originStoreID: string;

  @ApiProperty({
    description: 'ID de la tienda que recibe los productos',
    example: '660f9501-f30c-52e5-b827-557766551111',
  })
  @IsUUID()
  @IsNotEmpty()
  destinationStoreID: string;
}
