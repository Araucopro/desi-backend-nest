import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsString,
  IsUUID,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
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
    description: 'Monto del gasto',
    example: 1500.5,
  })
  @IsNumber()
  @IsPositive()
  amount!: number;

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
