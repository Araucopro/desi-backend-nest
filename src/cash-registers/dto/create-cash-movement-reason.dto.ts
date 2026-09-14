import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CashMovementType } from '../entities/cash-movement.entity';

export class CreateCashMovementReasonDto {
  @ApiProperty({
    description:
      'Código único de la razón en el tenant (se normaliza a mayúsculas)',
    example: 'CASH_WITHDRAWAL',
    maxLength: 50,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(50)
  code!: string;

  @ApiProperty({
    description: 'Nombre visible de la razón',
    example: 'Retiro de efectivo',
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({
    description:
      'Sentido del movimiento al que aplica la razón. Si se omite, la razón sirve para ambos sentidos (CASH_IN y CASH_OUT).',
    enum: CashMovementType,
    example: CashMovementType.CASH_OUT,
  })
  @IsOptional()
  @IsEnum(CashMovementType)
  type?: CashMovementType | null;

  @ApiPropertyOptional({
    description:
      'Si exige que el movimiento lo registre un supervisor (admin o jefe de tienda)',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  requiresApproval?: boolean;

  @ApiPropertyOptional({
    description: 'Si la razón está disponible para registrar movimientos',
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
