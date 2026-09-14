import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

/**
 * `value` y `type` son inmutables: identifican la denominación en el catálogo.
 * Si una denominación quedó mal configurada, se desactiva y se crea otra.
 */
export class UpdateCashDenominationDto {
  @ApiPropertyOptional({
    description: 'Etiqueta visible de la denominación',
    example: '$20.000',
    maxLength: 50,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  label?: string;

  @ApiPropertyOptional({
    description: 'Orden de despliegue (mayor valor primero)',
    example: 90,
    minimum: 0,
    maximum: 1000,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  sortOrder?: number;

  @ApiPropertyOptional({
    description:
      'Si la denominación está disponible para arqueos nuevos. Los conteos históricos conservan su snapshot.',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
