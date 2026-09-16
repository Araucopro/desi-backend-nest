import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class AuditLogQueryDto {
  @ApiPropertyOptional({
    description: 'Filtra la auditoría de un trabajador específico.',
    format: 'uuid',
    example: '2a8c8a1d-4d30-46a3-9a17-c7d3a3cc40ab',
  })
  @IsOptional()
  @IsUUID()
  employeeID?: string;

  @ApiPropertyOptional({
    description:
      'Incluye eventos cuyo rango afectado termina desde esta fecha.',
    format: 'date',
    example: '2026-09-01',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    description:
      'Incluye eventos cuyo rango afectado comienza hasta esta fecha.',
    format: 'date',
    example: '2026-09-30',
  })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({
    description: 'Cantidad máxima de eventos devueltos.',
    minimum: 1,
    maximum: 100,
    default: 50,
    example: 50,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;

  @ApiPropertyOptional({
    description: 'Cantidad de eventos a omitir antes de comenzar la página.',
    minimum: 0,
    default: 0,
    example: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset = 0;
}
