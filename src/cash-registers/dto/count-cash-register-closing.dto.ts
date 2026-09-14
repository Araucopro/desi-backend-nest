import {
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CountCashRegisterClosingDto {
  @ApiProperty({
    description:
      'Monto de efectivo físico contado por el cajero en el arqueo (>= 0)',
    example: 125000,
    minimum: 0,
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  countedCashAmount!: number;

  @ApiPropertyOptional({
    description: 'Observaciones o justificación de la diferencia detectada',
    example: 'Faltan $1.000 en sencillo',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
