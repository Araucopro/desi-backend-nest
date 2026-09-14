import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  CashMovementReason,
  CashMovementType,
} from '../entities/cash-movement.entity';

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
      'Razón del movimiento manual. SALE y REFUND quedan reservadas a los módulos de ventas y devoluciones.',
    enum: CashMovementReason,
    example: CashMovementReason.CASH_WITHDRAWAL,
  })
  @IsEnum(CashMovementReason)
  reason!: CashMovementReason;

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
