import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class OpenCashSessionDto {
  @ApiProperty({
    description: 'Fecha de operación contable (formato YYYY-MM-DD)',
    example: '2026-09-13',
  })
  @IsDateString()
  @IsNotEmpty()
  businessDate!: string;

  @ApiProperty({
    description: 'Saldo o fondo inicial de efectivo al abrir la caja (>= 0)',
    example: 50000,
    minimum: 0,
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  openingBalance!: number;

  @ApiPropertyOptional({
    description: 'Observaciones o notas de apertura',
    example: 'Apertura turno mañana con sencillo estándar',
  })
  @IsOptional()
  @IsString()
  openingNotes?: string;
}
