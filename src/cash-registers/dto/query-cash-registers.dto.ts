import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CashRegisterStatus } from '../entities/cash-register.entity';

export class QueryCashRegistersDto {
  @ApiPropertyOptional({
    description: 'Filtrar por ID de tienda',
    example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  })
  @IsOptional()
  @IsUUID()
  storeID?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por estado de caja',
    enum: CashRegisterStatus,
  })
  @IsOptional()
  @IsEnum(CashRegisterStatus)
  status?: CashRegisterStatus;
}
