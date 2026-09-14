import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { CashDenominationType } from '../entities/cash-denomination.entity';

export class CreateCashDenominationDto {
  @ApiProperty({
    description: 'Valor facial unitario de la denominación (> 0)',
    example: 20000,
    minimum: 0.01,
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  value!: number;

  @ApiProperty({
    description: 'Tipo de denominación: billete o moneda',
    enum: CashDenominationType,
    example: CashDenominationType.BANKNOTE,
  })
  @IsEnum(CashDenominationType)
  type!: CashDenominationType;

  @ApiPropertyOptional({
    description:
      'Etiqueta visible de la denominación. Si se omite se formatea el valor (ej. $20.000).',
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
    description: 'Si la denominación está disponible para arqueos nuevos',
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
