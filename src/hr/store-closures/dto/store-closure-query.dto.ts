import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

export class StoreClosureQueryDto {
  @ApiPropertyOptional({
    description: 'Devuelve cierres cuyo rango termina en esta fecha o después.',
    example: '2026-09-01',
    format: 'date',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    description: 'Devuelve cierres cuyo rango comienza en esta fecha o antes.',
    example: '2026-09-30',
    format: 'date',
  })
  @IsOptional()
  @IsDateString()
  to?: string;
}
