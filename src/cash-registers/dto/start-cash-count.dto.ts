import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class StartCashCountDto {
  @ApiPropertyOptional({
    description:
      'Observaciones iniciales del conteo detallado (por ejemplo: turno, incidencias)',
    example: 'Arqueo turno tarde',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
