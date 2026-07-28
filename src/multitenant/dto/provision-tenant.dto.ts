import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class ProvisionTenantDto {
  @ApiProperty({
    example: 'admin@empresa.com',
    description: 'Email del usuario administrador inicial del tenant',
  })
  @IsEmail()
  adminEmail!: string;

  @ApiProperty({
    example: 'Password123!',
    description: 'Contraseña del usuario administrador inicial',
  })
  @IsString()
  @MinLength(6)
  adminPassword!: string;

  @ApiProperty({
    example: 'Juan',
    description: 'Nombre del usuario administrador',
  })
  @IsString()
  adminFirstName!: string;

  @ApiProperty({
    example: 'Pérez',
    description: 'Apellido del usuario administrador',
  })
  @IsString()
  adminLastName!: string;

  @ApiProperty({
    example: 'Tienda Central Matriz',
    description: 'Nombre de la tienda central inicial',
  })
  @IsString()
  centralStoreName!: string;

  @ApiPropertyOptional({
    example: 'Av. Providencia 1234',
    description: 'Dirección de la tienda central',
  })
  @IsOptional()
  @IsString()
  centralStoreAddress?: string;

  @ApiPropertyOptional({
    example: 'STORE-CENTRAL-01',
    description: 'Código interno de la tienda central',
  })
  @IsOptional()
  @IsString()
  centralStoreCode?: string;
}
