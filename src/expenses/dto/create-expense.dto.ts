import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsBoolean,
  IsOptional,
  Min,
  IsString,
  IsUUID,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ExpenseType } from '../entities/expense.entity';

export class CreateExpenseDto {
  @ApiProperty({
    description: 'Nombre del gasto',
    example: 'Alquiler de oficina',
  })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({
    description: 'Fecha deducible del gasto',
    example: '2023-10-27T10:00:00Z',
  })
  @IsDateString()
  @IsNotEmpty()
  deductibleDate!: string; // IsDateString validates ISO 8601 strings

  @ApiProperty({
    description: 'Monto neto del gasto (sin IVA)',
    example: 1000,
  })
  @IsNumber()
  @Min(0)
  netAmount!: number;

  @ApiProperty({
    description: 'IVA del gasto',
    example: 190,
  })
  @IsNumber()
  @Min(0)
  taxAmount!: number;

  @ApiPropertyOptional({
    description: 'Aceptado para efectos tributarios (Art. 31 LIR)',
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  acceptedForTax?: boolean;

  @ApiPropertyOptional({
    description: 'IVA con derecho a crédito fiscal',
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  taxCredit?: boolean;

  @ApiPropertyOptional({
    description: 'Documento de respaldo (ej. factura de proveedor)',
    example: 'F-1234',
  })
  @IsOptional()
  @IsString()
  supportDocument?: string;

  @ApiProperty({
    description: 'Tipo de gasto',
    enum: ExpenseType,
    example: ExpenseType.ADMINISTRATIVE,
  })
  @IsEnum(ExpenseType)
  @IsNotEmpty()
  type!: ExpenseType;

  @ApiProperty({
    description: 'ID de la tienda asociada al gasto',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  @IsNotEmpty()
  storeID!: string;
}
