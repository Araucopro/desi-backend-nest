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
    description:
      'Total aceptado (deducible Art. 31 LIR) para este tipo en el mes',
    example: 12000,
  })
  accepted!: number;

  @ApiProperty({
    description: 'Total rechazado (no deducible) para este tipo en el mes',
    example: 3000,
  })
  rejected!: number;
}

export class IncomeStatementMonthDto {
  @ApiProperty({ description: 'Número de mes del 1 al 12', example: 1 })
  month!: number;

  @ApiProperty({ description: 'Nombre del mes', example: 'Enero' })
  label!: string;

  @ApiProperty({ description: 'Año del bucket mensual', example: 2026 })
  year!: number;

  @ApiProperty({
    description:
      'Ingresos por ventas netos (sin IVA). Las notas de crédito 61 restan',
    example: 125000,
  })
  salesIncome!: number;

  @ApiProperty({
    description:
      'IVA débito de las ventas del mes (las notas de crédito restan)',
    example: 23750,
  })
  salesTax!: number;

  @ApiProperty({
    description: 'Costo de venta (COGS) congelado al momento de la venta',
    example: 70000,
  })
  cogs!: number;

  @ApiProperty({
    description: 'Margen bruto: salesIncome - cogs',
    example: 55000,
  })
  grossProfit!: number;

  @ApiProperty({
    description: 'Egresos por gastos aceptados (Art. 31 LIR)',
    example: 35000,
  })
  expenses!: number;

  @ApiProperty({
    description: 'Gastos rechazados (no deducibles)',
    example: 5000,
  })
  rejectedExpenses!: number;

  @ApiProperty({
    description:
      'Compras a proveedores (van a inventario, no son egreso directo)',
    example: 42000,
  })
  purchases!: number;

  @ApiProperty({
    description: 'IVA crédito fiscal de compras y gastos con derecho a crédito',
    example: 7980,
  })
  creditTax!: number;

  @ApiProperty({
    type: [IncomeStatementExpenseDetailDto],
    description: 'Detalle de gastos del mes por tipo (aceptado/rechazado)',
  })
  expenseDetail!: IncomeStatementExpenseDetailDto[];

  @ApiProperty({
    description:
      'Resultado neto del mes: salesIncome - cogs - expenses aceptados',
    example: 20000,
  })
  net!: number;
}

export class IncomeStatementTotalsDto {
  @ApiProperty({
    description: 'Total acumulado de ventas netas',
    example: 800000,
  })
  salesIncome!: number;

  @ApiProperty({
    description: 'Total acumulado de IVA débito',
    example: 152000,
  })
  salesTax!: number;

  @ApiProperty({
    description: 'Total acumulado de costo de venta',
    example: 480000,
  })
  cogs!: number;

  @ApiProperty({
    description: 'Margen bruto acumulado',
    example: 320000,
  })
  grossProfit!: number;

  @ApiProperty({
    description: 'Total acumulado de gastos aceptados',
    example: 150000,
  })
  expenses!: number;

  @ApiProperty({
    description: 'Total acumulado de gastos rechazados',
    example: 20000,
  })
  rejectedExpenses!: number;

  @ApiProperty({
    description: 'Total acumulado de compras a proveedores',
    example: 300000,
  })
  purchases!: number;

  @ApiProperty({
    description: 'Total acumulado de IVA crédito fiscal',
    example: 57000,
  })
  creditTax!: number;

  @ApiProperty({ description: 'Total neto acumulado', example: 170000 })
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
