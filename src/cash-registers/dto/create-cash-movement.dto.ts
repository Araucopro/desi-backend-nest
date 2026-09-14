import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { CashMovementType } from '../entities/cash-movement.entity';

export class CreateCashMovementDto {
  @ApiProperty({
    description: 'Dirección del movimiento de efectivo',
    enum: CashMovementType,
    example: CashMovementType.CASH_OUT,
  })
  @IsEnum(CashMovementType)
  type!: CashMovementType;

  @ApiProperty({
    description: 'Monto del movimiento, siempre positivo (>= 0.01)',
    example: 30000,
    minimum: 0.01,
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount!: number;

  @ApiProperty({
    description:
      'Código de la razón del movimiento manual según el catálogo del tenant (se normaliza a mayúsculas). SALE, REFUND y CASH_TRANSFER quedan reservadas a los módulos de ventas, devoluciones y transferencias de fondos; las razones con requiresApproval exigen supervisor.',
    example: 'CASH_WITHDRAWAL',
    maxLength: 50,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Matches(/^[A-Za-z0-9 _-]+$/, {
    message:
      'El código de razón solo admite letras, números, espacios, guiones y guiones bajos',
  })
  reason!: string;

  @ApiPropertyOptional({
    description: 'Descripción o justificación del movimiento',
    example: 'Retiro de excedente para bóveda',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  description?: string;
}
