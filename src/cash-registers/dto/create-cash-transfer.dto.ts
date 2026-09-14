import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { CashTransferDestinationType } from '../entities/cash-transfer.entity';

export class CreateCashTransferDto {
  @ApiProperty({
    description:
      'Tipo de destino del efectivo: otra caja del tenant o bóveda/tesorería',
    enum: CashTransferDestinationType,
    example: CashTransferDestinationType.VAULT,
  })
  @IsEnum(CashTransferDestinationType)
  destinationType!: CashTransferDestinationType;

  @ApiPropertyOptional({
    description:
      'ID UUID de la caja destino. Obligatorio cuando destinationType = CASH_REGISTER y debe ser distinto de la caja origen; la sesión destino se resuelve al completar la transferencia.',
    example: '7c1d6a4e-3f6f-4a2f-9c9e-0c2c1f6a1b21',
  })
  @IsOptional()
  @IsUUID()
  destinationCashRegisterID?: string;

  @ApiPropertyOptional({
    description:
      'Nombre del destino externo cuando destinationType = VAULT (por ejemplo "Bóveda central")',
    example: 'Bóveda central',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  destinationLabel?: string;

  @ApiProperty({
    description: 'Monto de efectivo a trasladar, siempre positivo (= 0.01)',
    example: 250000,
    minimum: 0.01,
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount!: number;

  @ApiPropertyOptional({
    description: 'Motivo o comentario de la solicitud de traslado',
    example: 'Retiro de excedente del turno mañana',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  notes?: string;
}
