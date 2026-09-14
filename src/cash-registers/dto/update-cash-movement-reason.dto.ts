import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CashMovementType } from '../entities/cash-movement.entity';

export class UpdateCashMovementReasonDto {
  @ApiPropertyOptional({
    description: 'Nombre visible de la razón',
    example: 'Retiro de efectivo a bóveda',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({
    description:
      'Sentido del movimiento al que aplica la razón. Enviar null para que aplique a ambos sentidos.',
    enum: CashMovementType,
    nullable: true,
  })
  @IsOptional()
  @IsEnum(CashMovementType)
  type?: CashMovementType | null;

  @ApiPropertyOptional({
    description:
      'Si exige que el movimiento lo registre un supervisor (admin o jefe de tienda)',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  requiresApproval?: boolean;

  @ApiPropertyOptional({
    description: 'Si la razón está disponible para registrar movimientos',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
