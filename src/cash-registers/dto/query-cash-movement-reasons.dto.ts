import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CashMovementType } from '../entities/cash-movement.entity';

export class QueryCashMovementReasonsDto {
  @ApiPropertyOptional({
    description: 'Filtrar por razones activas o inactivas',
    example: true,
  })
  @IsOptional()
  @Transform(({ value }) =>
    value === undefined ? undefined : value === true || value === 'true',
  )
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({
    description:
      'Filtrar por razones que aplican a un sentido de movimiento (incluye las que aplican a ambos)',
    enum: CashMovementType,
  })
  @IsOptional()
  @IsEnum(CashMovementType)
  type?: CashMovementType;

  @ApiPropertyOptional({
    description: 'Filtrar por razones que exigen aprobación de supervisor',
    example: true,
  })
  @IsOptional()
  @Transform(({ value }) =>
    value === undefined ? undefined : value === true || value === 'true',
  )
  @IsBoolean()
  requiresApproval?: boolean;
}
