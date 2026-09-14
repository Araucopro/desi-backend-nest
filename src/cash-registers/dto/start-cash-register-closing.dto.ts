import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class StartCashRegisterClosingDto {
  @ApiPropertyOptional({
    description:
      'Observaciones del arqueo (por ejemplo: novedades del turno antes del conteo)',
    example: 'Turno tarde con recuento de sencillo pendiente',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
