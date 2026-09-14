import { IsDateString, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QueryStoreCashSummaryDto {
  @ApiPropertyOptional({
    description:
      'Fecha contable inicial (YYYY-MM-DD). Por defecto, 29 días antes de la fecha final.',
    example: '2026-09-01',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    description:
      'Fecha contable final (YYYY-MM-DD). Por defecto, la fecha contable de hoy en la zona horaria del tenant.',
    example: '2026-09-30',
  })
  @IsOptional()
  @IsDateString()
  to?: string;
}
