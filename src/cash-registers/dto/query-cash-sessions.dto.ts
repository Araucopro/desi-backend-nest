import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CashRegisterSessionStatus } from '../entities/cash-register-session.entity';

export class QueryCashSessionsDto {
  @ApiPropertyOptional({
    description: 'Filtrar por estado de la sesión',
    enum: CashRegisterSessionStatus,
  })
  @IsOptional()
  @IsEnum(CashRegisterSessionStatus)
  status?: CashRegisterSessionStatus;

  @ApiPropertyOptional({
    description: 'Fecha contable inicial (YYYY-MM-DD)',
    example: '2026-09-01',
  })
  @IsOptional()
  @IsDateString()
  fromBusinessDate?: string;

  @ApiPropertyOptional({
    description: 'Fecha contable final (YYYY-MM-DD)',
    example: '2026-09-30',
  })
  @IsOptional()
  @IsDateString()
  toBusinessDate?: string;
}
