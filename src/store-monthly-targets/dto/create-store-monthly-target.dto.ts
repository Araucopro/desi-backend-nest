import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsUUID,
} from 'class-validator';

export class CreateStoreMonthlyTargetDto {
  @ApiProperty({
    description: 'ID de la tienda a la que pertenece la meta mensual',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  @IsNotEmpty()
  storeID!: string;

  @ApiProperty({
    description:
      'Mes objetivo en formato ISO. Se normaliza al primer día del mes.',
    example: '2026-04-01',
  })
  @IsDateString()
  @IsNotEmpty()
  period!: string;

  @ApiProperty({
    description: 'Monto meta de ventas para ese mes',
    example: 25000000,
  })
  @IsNumber()
  @IsPositive()
  targetAmount!: number;
}
