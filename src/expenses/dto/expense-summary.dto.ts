import { ApiProperty } from '@nestjs/swagger';
import { ExpenseType } from '../entities/expense.entity';

export class ExpenseTypeSummaryDto {
  @ApiProperty({
    description: 'Tipo de gasto',
    enum: ExpenseType,
    example: ExpenseType.ADMINISTRATIVE,
  })
  type!: ExpenseType;

  @ApiProperty({
    description: 'Total acumulado para este tipo de gasto',
    example: 35000,
  })
  total!: number;
}

export class ExpenseMonthlySummaryMonthDto {
  @ApiProperty({
    description: 'Número de mes del 1 al 12',
    example: 1,
  })
  month!: number;

  @ApiProperty({
    description: 'Nombre del mes',
    example: 'Enero',
  })
  label!: string;

  @ApiProperty({
    description: 'Total del mes',
    example: 35000,
  })
  total!: number;

  @ApiProperty({
    type: [ExpenseTypeSummaryDto],
    description: 'Desglose del mes por tipo de gasto',
  })
  byType!: ExpenseTypeSummaryDto[];
}

export class ExpenseMonthlySummaryTotalsDto {
  @ApiProperty({
    description: 'Total acumulado del año',
    example: 150000,
  })
  total!: number;

  @ApiProperty({
    type: [ExpenseTypeSummaryDto],
    description: 'Desglose acumulado del año por tipo de gasto',
  })
  byType!: ExpenseTypeSummaryDto[];
}

export class ExpenseSummaryDto {
  @ApiProperty({
    description: 'Año consultado',
    example: 2026,
  })
  year!: number;

  @ApiProperty({
    type: [ExpenseMonthlySummaryMonthDto],
    description: 'Serie mensual del año actual',
  })
  months!: ExpenseMonthlySummaryMonthDto[];

  @ApiProperty({
    type: ExpenseMonthlySummaryTotalsDto,
    description: 'Totales acumulados del año',
  })
  totals!: ExpenseMonthlySummaryTotalsDto;
}
