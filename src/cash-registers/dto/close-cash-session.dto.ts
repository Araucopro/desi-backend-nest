import { IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CloseCashSessionDto {
  @ApiProperty({
    description:
      'Monto total de efectivo físico contado en el arqueo de cierre (>= 0)',
    example: 125000,
    minimum: 0,
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  countedCashBalance!: number;

  @ApiPropertyOptional({
    description:
      'Observaciones o notas de cierre / justificación de diferencias',
    example: 'Cierre turno tarde sin novedades',
  })
  @IsOptional()
  @IsString()
  closingNotes?: string;
}
