import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { DispatchGuideStatus } from '../entities/dispatch-guide.entity';

export class ListDispatchGuidesQueryDto {
  @ApiPropertyOptional({
    description: 'Filtro por estado',
    enum: DispatchGuideStatus,
  })
  @IsOptional()
  @IsEnum(DispatchGuideStatus)
  status?: DispatchGuideStatus;

  @ApiPropertyOptional({
    description: 'Fecha inicial (ISO)',
    example: '2026-08-01',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    description: 'Fecha final (ISO, exclusiva)',
    example: '2026-09-01',
  })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ description: 'Página', default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Tamaño de página', default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 50;
}
