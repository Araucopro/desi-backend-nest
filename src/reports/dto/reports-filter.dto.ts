import { IsOptional, IsString, IsISO8601, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ReportsFilterDto {
  @IsString()
  @ApiPropertyOptional({
    description: 'ID de la tienda para filtrar el reporte',
    example: 'store-uuid',
  })
  storeId!: string;

  @IsOptional()
  @IsISO8601()
  @ApiPropertyOptional({
    description:
      'Fecha desde (inclusive) en formato ISO 8601. Ej: 2026-04-01T00:00:00Z',
  })
  from?: string;

  @IsOptional()
  @IsISO8601()
  @ApiPropertyOptional({
    description:
      'Fecha hasta (exclusive) en formato ISO 8601. Ej: 2026-04-17T00:00:00Z',
  })
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ApiPropertyOptional({ description: 'Página (paginación)', example: 1 })
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ApiPropertyOptional({ description: 'Tamaño de página', example: 50 })
  limit?: number = 50;
}
