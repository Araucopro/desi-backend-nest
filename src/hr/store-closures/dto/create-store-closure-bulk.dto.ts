import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreateStoreClosureBulkDto {
  @ApiPropertyOptional({
    description:
      'Lista explícita de fechas que se cerrarán. No combinar con from/to.',
    type: [String],
    example: ['2026-09-18', '2026-09-19'],
    format: 'date',
    maxItems: 366,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(366)
  @IsDateString({}, { each: true })
  dates?: string[];

  @ApiPropertyOptional({
    description:
      'Inicio del rango para generar cierres. Requerido junto con to cuando no se envía dates.',
    example: '2026-09-01',
    format: 'date',
  })
  @ValidateIf((value: CreateStoreClosureBulkDto) => !value.dates?.length)
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    description:
      'Fin del rango para generar cierres. Es inclusive y se usa junto con from.',
    example: '2026-12-31',
    format: 'date',
  })
  @ValidateIf((value: CreateStoreClosureBulkDto) => !value.dates?.length)
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({
    description:
      'Días de semana ISO reducido: 0 domingo, 1 lunes, ..., 6 sábado. Ejemplo [0] cierra todos los domingos del rango.',
    type: [Number],
    example: [0],
    minItems: 1,
    maxItems: 7,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  weekdays?: number[];

  @ApiProperty({
    description: 'Motivo aplicado a cada cierre generado.',
    example: 'Domingos no operativos',
    maxLength: 500,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}
