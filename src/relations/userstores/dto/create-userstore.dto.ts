import { IsString, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateUserstoreDto {
  @ApiProperty({
    description: 'ID del usuario a asignar a la tienda',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsString()
  @IsUUID()
  userID!: string;

  @ApiProperty({
    description: 'ID de la tienda donde se asignará el usuario',
    example: '123e4567-e89b-12d3-a456-426614174001',
  })
  @IsString()
  @IsUUID()
  storeID!: string;
}
