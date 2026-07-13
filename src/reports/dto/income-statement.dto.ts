import { ApiProperty } from '@nestjs/swagger';
import { ExpenseType } from '../../expenses/entities/expense.entity';

export class IncomeStatementExpenseDetailDto {
  @ApiProperty({
    description: 'Tipo de gasto',
    enum: ExpenseType,
    example: ExpenseType.ADMINISTRATIVE,
  })
  type!: ExpenseType;

  @ApiProperty({
    description: 'Total acumulado para este tipo de gasto en el mes',
    example: 15000,
  })
  total!: number;
}

export class IncomeStatementMonthDto {
  @ApiProperty({ description: 'Número de mes del 1 al 12', example: 1 })
  month!: number;

  @ApiProperty({ description: 'Nombre del mes', example: 'Enero' })
  label!: string;

  @ApiProperty({ description: 'Año del bucket mensual', example: 2026 })
  year!: number;

  @ApiProperty({ description: 'Ingresos por ventas pagadas', example: 125000 })
  salesIncome!: number;

  @ApiProperty({
    description: 'Ingresos por purchase orders pagadas',
    example: 42000,
  })
  purchaseOrdersIncome!: number;

  @ApiProperty({ description: 'Egresos por gastos', example: 35000 })
  expenses!: number;

  @ApiProperty({
    type: [IncomeStatementExpenseDetailDto],
    description: 'Detalle de gastos del mes por tipo de gasto',
  })
  expenseDetail!: IncomeStatementExpenseDetailDto[];

  @ApiProperty({ description: 'Resultado neto del mes', example: 132000 })
  net!: number;
}

export class IncomeStatementTotalsDto {
  @ApiProperty({
    description: 'Total acumulado de ventas pagadas',
    example: 800000,
  })
  salesIncome!: number;

  @ApiProperty({
    description: 'Total acumulado de purchase orders pagadas',
    example: 200000,
  })
  purchaseOrdersIncome!: number;

  @ApiProperty({ description: 'Total acumulado de egresos', example: 150000 })
  expenses!: number;

  @ApiProperty({ description: 'Total neto acumulado', example: 850000 })
  net!: number;
}

export class IncomeStatementDto {
  @ApiProperty({ description: 'Año consultado', example: 2026 })
  year!: number;

  @ApiProperty({
    description: 'ID de la tienda filtrada, si aplica',
    example: 'store-uuid',
    required: false,
  })
  storeId?: string;

  @ApiProperty({
    type: [IncomeStatementMonthDto],
    description: 'Serie mensual con ceros para meses sin movimientos',
  })
  months!: IncomeStatementMonthDto[];

  @ApiProperty({
    type: IncomeStatementTotalsDto,
    description: 'Totales acumulados del período',
  })
  totals!: IncomeStatementTotalsDto;
}
