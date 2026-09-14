import {
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CompleteCashRegisterClosingDto {
  @ApiPropertyOptional({
    description:
      'Monto de efectivo contado. Si ya se registró con el conteo previo puede omitirse; si se envía, reemplaza el valor registrado.',
    example: 125000,
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  countedCashAmount?: number;

  @ApiPropertyOptional({
    description:
      'Observaciones finales del arqueo (justificación de diferencias, incidencias)',
    example: 'Diferencia asumida por el cajero, queda en revisión',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
