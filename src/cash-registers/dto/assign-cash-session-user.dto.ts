import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CashRegisterSessionUserRole } from '../entities/cash-register-session-user.entity';

export class AssignCashSessionUserDto {
  @ApiProperty({
    description:
      'ID del usuario que atenderá la caja. Debe tener relación vigente con la tienda de la caja.',
    example: '8f14e45f-ceea-467f-a1c2-3b1c1a2f9d10',
  })
  @IsUUID()
  userID!: string;

  @ApiPropertyOptional({
    description:
      'Rol del operador dentro de la sesión (cajero o supervisor de apoyo)',
    enum: CashRegisterSessionUserRole,
    default: CashRegisterSessionUserRole.OPERATOR,
  })
  @IsOptional()
  @IsEnum(CashRegisterSessionUserRole)
  role?: CashRegisterSessionUserRole;

  @ApiPropertyOptional({
    description:
      'Hora de entrada del operador (ISO 8601). Si se omite se usa la hora actual. No puede ser anterior a la apertura de la sesión.',
    example: '2026-09-13T13:05:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  enteredAt?: string;

  @ApiPropertyOptional({
    description: 'Observaciones del turno del operador',
    example: 'Refuerzo turno tarde',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
