import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CashRegisterStatus } from '../entities/cash-register.entity';

export class UpdateCashRegisterDto {
  @ApiPropertyOptional({
    description: 'Código identificador de la caja en la tienda',
    example: 'CAJA-01',
    maxLength: 50,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  code?: string;

  @ApiPropertyOptional({
    description: 'Nombre descriptivo de la caja',
    example: 'Caja Principal Entrada',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({
    description: 'Estado de la caja',
    enum: CashRegisterStatus,
  })
  @IsOptional()
  @IsEnum(CashRegisterStatus)
  status?: CashRegisterStatus;
}
