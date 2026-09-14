import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterCashSessionUserExitDto {
  @ApiPropertyOptional({
    description:
      'Hora de salida del operador (ISO 8601). Si se omite se usa la hora actual. No puede ser anterior a su hora de entrada.',
    example: '2026-09-13T20:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  leftAt?: string;

  @ApiPropertyOptional({
    description: 'Observaciones del cierre de turno del operador',
    example: 'Entrega de caja a turno noche',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
