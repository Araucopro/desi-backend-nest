import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CashRegisterStatus } from '../entities/cash-register.entity';

export class CreateCashRegisterDto {
  @ApiProperty({
    description: 'ID de la tienda a la que pertenece la caja',
    example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  })
  @IsUUID()
  @IsNotEmpty()
  storeID!: string;

  @ApiProperty({
    description: 'Código identificador de la caja en la tienda',
    example: 'CAJA-01',
    maxLength: 50,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(50)
  code!: string;

  @ApiProperty({
    description: 'Nombre descriptivo de la caja',
    example: 'Caja Principal Entrada',
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({
    description: 'Estado inicial de la caja',
    enum: CashRegisterStatus,
    default: CashRegisterStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(CashRegisterStatus)
  status?: CashRegisterStatus;
}
