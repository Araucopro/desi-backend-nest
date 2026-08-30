import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { TenantStatus } from '../entities/tenant.entity';

export class CreateTenantDto {
  @ApiProperty({
    example: 'Tienda',
    description: 'Nombre del tenant / empresa',
  })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiPropertyOptional({
    enum: TenantStatus,
    default: TenantStatus.ACTIVE,
    example: TenantStatus.ACTIVE,
    description: 'Estado inicial del tenant',
  })
  @IsOptional()
  @IsEnum(TenantStatus)
  status?: TenantStatus;

  @ApiPropertyOptional({
    example: 5,
    default: 5,
    description: 'Cantidad máxima de tiendas permitidas',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxStores?: number;

  @ApiPropertyOptional({
    example: 5,
    default: 5,
    description: 'Cantidad máxima de usuarios permitidos',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxUsers?: number;

  @ApiPropertyOptional({
    example: 'America/Santiago',
    default: 'America/Santiago',
    description: 'Zona horaria del tenant',
  })
  @IsOptional()
  @IsString()
  timeZone?: string;

  @ApiPropertyOptional({
    example: 'es-CL',
    default: 'es-CL',
    description: 'Locale del tenant',
  })
  @IsOptional()
  @IsString()
  locale?: string;
}
