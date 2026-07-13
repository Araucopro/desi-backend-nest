import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import {
  IsNumber,
  IsPositive,
  IsOptional,
  IsDateString,
} from 'class-validator';

export class UpsertStoreMonthlyTargetDto {
  @ApiPropertyOptional({
    description:
      'Periodo objetivo como YYYY/MM o YYYY/MM/DD. Si se omite, se usa el mes actual',
    example: '2026/04',
  })
  @IsOptional()
  @IsDateString()
  period?: string;

  @ApiProperty({
    description: 'Monto meta de ventas para ese mes',
    example: 26000000,
  })
  @IsNumber()
  @IsPositive()
  targetAmount!: number;
}
