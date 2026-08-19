import { DteDocument } from '../dte/entities/dte-document.entity';
import { FinancialMovementCategory } from '../financial-movements/entities/financial-movement.entity';
import { Sale } from '../sales/entities/sale.entity';
import {
  IncomeStatementExpenseDetailDto,
  IncomeStatementMonthDto,
  IncomeStatementTotalsDto,
} from './dto/income-statement.dto';
import { SalesReportResponseDto } from './dto/sales-report.dto';
import {
  buildTotals,
  CountTotalAggregate,
  createExpenseDetailSeries,
  createMonthlySeries,
  expenseTypeForCategory,
  FinancialMovementRow,
  GroupedAggregate,
  isExpenseCategory,
  mergeGrouped,
  mergeSummary,
  serializeDocument,
  serializeSaleNote,
  toMoney,
  toNumber,
} from './report-helpers';

export function buildIncomeStatementReport(
  rows: FinancialMovementRow[],
  year: number,
): {
  months: IncomeStatementMonthDto[];
  totals: IncomeStatementTotalsDto;
} {
  const salesIncomeByMonth = new Map<number, number>();
  const salesTaxByMonth = new Map<number, number>();
  const cogsByMonth = new Map<number, number>();
  const expensesByMonth = new Map<number, number>();
  const rejectedExpensesByMonth = new Map<number, number>();
  const purchasesByMonth = new Map<number, number>();
  const creditTaxByMonth = new Map<number, number>();
  const expenseDetailByMonth = new Map<
    number,
    IncomeStatementExpenseDetailDto[]
  >(
    createMonthlySeries(year).map((month) => [
      month.month,
      createExpenseDetailSeries(),
    ]),
  );

  for (const row of rows) {
    const monthNumber = Number(row.month);
    const amount = toNumber(row.total);
    const taxAmount = toNumber(row.taxTotal);
    const category = row.category;
    const add = (map: Map<number, number>, value: number) =>
      map.set(monthNumber, (map.get(monthNumber) ?? 0) + value);

    if (category === FinancialMovementCategory.VENTA) {
      add(salesIncomeByMonth, amount);
      add(salesTaxByMonth, taxAmount);
      continue;
    }

    if (category === FinancialMovementCategory.COSTO_VENTA) {
      add(cogsByMonth, amount);
      continue;
    }

    if (category === FinancialMovementCategory.COMPRA) {
      add(purchasesByMonth, amount);
      if (row.taxCredit) {
        add(creditTaxByMonth, taxAmount);
      }
      continue;
    }

    if (isExpenseCategory(category)) {
      const type = expenseTypeForCategory(category);
      const monthDetails =
        expenseDetailByMonth.get(monthNumber) ?? createExpenseDetailSeries();
      const typeDetail = monthDetails.find((item) => item.type === type);

      if (row.acceptedForTax) {
        add(expensesByMonth, amount);
        if (typeDetail) typeDetail.accepted += amount;
      } else {
        add(rejectedExpensesByMonth, amount);
        if (typeDetail) typeDetail.rejected += amount;
      }

      if (row.taxCredit) {
        add(creditTaxByMonth, taxAmount);
      }
    }
  }

  const months = createMonthlySeries(year).map((month) => {
    const salesIncome = salesIncomeByMonth.get(month.month) ?? 0;
    const salesTax = salesTaxByMonth.get(month.month) ?? 0;
    const cogs = cogsByMonth.get(month.month) ?? 0;
    const expenses = expensesByMonth.get(month.month) ?? 0;
    const rejectedExpenses = rejectedExpensesByMonth.get(month.month) ?? 0;
    const purchases = purchasesByMonth.get(month.month) ?? 0;
    const creditTax = creditTaxByMonth.get(month.month) ?? 0;
    const grossProfit = salesIncome - cogs;
    const net = salesIncome - cogs - expenses;

    return {
      ...month,
      salesIncome: toMoney(salesIncome),
      salesTax: toMoney(salesTax),
      cogs: toMoney(cogs),
      grossProfit: toMoney(grossProfit),
      expenses: toMoney(expenses),
      rejectedExpenses: toMoney(rejectedExpenses),
      purchases: toMoney(purchases),
      creditTax: toMoney(creditTax),
      expenseDetail:
        expenseDetailByMonth.get(month.month) ?? createExpenseDetailSeries(),
      net: toMoney(net),
    };
  });

  return {
    months,
    totals: buildTotals(months),
  };
}

export function buildPeriodBoundaries(now: Date) {
  const todayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    0,
    0,
    0,
    0,
  );
  const tomorrowStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    0,
    0,
    0,
    0,
  );
  const yesterdayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - 1,
    0,
    0,
    0,
    0,
  );
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);

  return { todayStart, tomorrowStart, yesterdayStart, monthStart };
}

export function buildSalesReportResult(input: {
  paymentRaw: Array<Record<string, unknown>>;
  statusRaw: Array<Record<string, unknown>>;
  salePaymentRaw: Array<Record<string, unknown>>;
  saleStatusRaw: Array<Record<string, unknown>>;
  todaySummary: CountTotalAggregate;
  yesterdaySummary: CountTotalAggregate;
  monthSummary: CountTotalAggregate;
  todayNotes: CountTotalAggregate;
  yesterdayNotes: CountTotalAggregate;
  monthNotes: CountTotalAggregate;
  documents: DteDocument[];
  notes: Sale[];
  page: number;
  limit: number;
  total: number;
  notesTotal: number;
}): SalesReportResponseDto {
  const groupedByPaymentType: GroupedAggregate[] = mergeGrouped(
    input.paymentRaw,
    input.salePaymentRaw,
  );
  const groupedByStatus: GroupedAggregate[] = mergeGrouped(
    input.statusRaw,
    input.saleStatusRaw,
  );

  const combined = [
    ...input.documents.map((document) => serializeDocument(document)),
    ...input.notes.map((note) => serializeSaleNote(note)),
  ]
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .slice((input.page - 1) * input.limit, input.page * input.limit);

  return {
    groupedByPaymentType,
    groupedByStatus,
    periodSummary: {
      today: mergeSummary(input.todaySummary, input.todayNotes),
      yesterday: mergeSummary(input.yesterdaySummary, input.yesterdayNotes),
      month: mergeSummary(input.monthSummary, input.monthNotes),
    },
    sales: combined,
    meta: {
      page: input.page,
      limit: input.limit,
      total: input.total + input.notesTotal,
    },
  };
}
