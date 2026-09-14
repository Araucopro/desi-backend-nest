import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CashDenominationType } from '../entities/cash-denomination.entity';

export class QueryCashDenominationsDto {
  @ApiPropertyOptional({
    description: 'Filtrar por denominaciones activas o inactivas',
    example: true,
  })
  @IsOptional()
  @Transform(({ value }) =>
    value === undefined ? undefined : value === true || value === 'true',
  )
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({
    description: 'Filtrar por tipo de denominación (billete o moneda)',
    enum: CashDenominationType,
  })
  @IsOptional()
  @IsEnum(CashDenominationType)
  type?: CashDenominationType;
}
