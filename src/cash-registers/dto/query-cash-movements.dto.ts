import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  CashMovementReferenceType,
  CashMovementStatus,
  CashMovementType,
} from '../entities/cash-movement.entity';

export class QueryCashMovementsDto {
  @ApiPropertyOptional({
    description: 'Filtrar por dirección del movimiento',
    enum: CashMovementType,
  })
  @IsOptional()
  @IsEnum(CashMovementType)
  type?: CashMovementType;

  @ApiPropertyOptional({
    description: 'Filtrar por estado del movimiento',
    enum: CashMovementStatus,
  })
  @IsOptional()
  @IsEnum(CashMovementStatus)
  status?: CashMovementStatus;

  @ApiPropertyOptional({
    description: 'Filtrar por origen del movimiento',
    enum: CashMovementReferenceType,
  })
  @IsOptional()
  @IsEnum(CashMovementReferenceType)
  referenceType?: CashMovementReferenceType;

  @ApiPropertyOptional({
    description: 'Fecha/hora mínima de ocurrencia (ISO 8601)',
    example: '2026-09-13T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    description: 'Fecha/hora máxima de ocurrencia (ISO 8601)',
    example: '2026-09-13T23:59:59.999Z',
  })
  @IsOptional()
  @IsDateString()
  to?: string;
}
