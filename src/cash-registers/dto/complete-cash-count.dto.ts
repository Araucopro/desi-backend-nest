import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CompleteCashCountDto {
  @ApiPropertyOptional({
    description:
      'Momento en que terminó el conteo físico (ISO 8601). Si se omite se usa la hora actual.',
    example: '2026-09-13T21:30:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  countedAt?: string;

  @ApiPropertyOptional({
    description: 'Observaciones finales del conteo detallado',
    example: 'Conteo verificado por supervisor de turno',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
