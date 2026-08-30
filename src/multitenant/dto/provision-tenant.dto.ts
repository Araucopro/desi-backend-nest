import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';
import { CreateStoreDto } from '../../stores/dto/create-store.dto';
import { CreateUserDto } from '../../users/dto/create-user.dto';

export class ProvisionTenantDto {
  @ApiProperty({
    type: CreateUserDto,
    description: 'Datos completos del usuario administrador inicial del tenant',
  })
  @ValidateNested()
  @Type(() => CreateUserDto)
  user!: CreateUserDto;

  @ApiProperty({
    type: CreateStoreDto,
    description: 'Datos completos de la tienda inicial del tenant',
  })
  @ValidateNested()
  @Type(() => CreateStoreDto)
  store!: CreateStoreDto;
}
