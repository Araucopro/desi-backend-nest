import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CashRegisterSessionUserRole } from '../entities/cash-register-session-user.entity';

export class QueryCashSessionUsersDto {
  @ApiPropertyOptional({
    description:
      'true = solo operadores actualmente en turno (sin hora de salida); false = solo operadores que ya salieron',
    example: true,
  })
  @IsOptional()
  @Transform(({ value }) =>
    value === undefined ? undefined : value === true || value === 'true',
  )
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({
    description: 'Filtrar por rol del operador en la sesión',
    enum: CashRegisterSessionUserRole,
  })
  @IsOptional()
  @IsEnum(CashRegisterSessionUserRole)
  role?: CashRegisterSessionUserRole;
}
