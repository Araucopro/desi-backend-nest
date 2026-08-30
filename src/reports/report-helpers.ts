import {
  DteDocument,
  DteDocumentStatus,
} from '../dte/entities/dte-document.entity';
import { ExpenseType } from '../expenses/entities/expense.entity';
import {
  FinancialMovementCategory,
  FinancialMovementDirection,
} from '../financial-movements/entities/financial-movement.entity';
import {
  IncomeStatementExpenseDetailDto,
  IncomeStatementMonthDto,
  IncomeStatementTotalsDto,
} from './dto/income-statement.dto';
import { Sale, SaleType } from '../sales/entities/sale.entity';
import {
  DEFAULT_TIMEZONE,
  getStartOfDayInTimezone,
  getStartOfMonthInTimezone,
  getYearBoundsInTimezone,
} from '../common/utils/date-timezone.util';

export type FinancialMovementRow = {
  month: string | number;
  category: FinancialMovementCategory;
  direction: FinancialMovementDirection;
  taxCredit: boolean;
  acceptedForTax: boolean;
  total: string | number | null;
  taxTotal: string | number | null;
};

export type DteDocumentListItem = {
  dteDocumentID: string;
  token: string;
  folio: number;
  status: DteDocumentStatus;
  paymentType: string;
  total: number;
  documentType: number | null;
  createdAt: Date;
  updatedAt: Date;
  store: {
    storeID: string;
    rut: string;
    name: string;
    location: string | null;
  } | null;
  items: Array<Record<string, unknown>>;
  payloadNormalized: Record<string, unknown>;
};

export type SaleListItem = {
  saleID: string;
  dteDocumentID: string | null;
  saleType: SaleType;
  token: string | null;
  folio: number | null;
  status: string;
  paymentType: string;
  total: number;
  documentType: number | null;
  createdAt: Date;
  updatedAt: Date;
  store: {
    storeID: string;
    rut: string;
    name: string;
    location: string | null;
  } | null;
  items: Array<Record<string, unknown>>;
  payloadNormalized: Record<string, unknown>;
};

export type GroupedAggregate = {
  key: string;
  count: number;
  total: number;
};

export type CountTotalAggregate = {
  count: number;
  total: number;
};

export function toNumber(value: string | number | null | undefined): number {
  return Number(value ?? 0);
}

export function toMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function getYearBounds(
  year: number,
  timeZone: string = DEFAULT_TIMEZONE,
) {
  return getYearBoundsInTimezone(year, timeZone);
}

export function getMonthLabels() {
  return [
    'Enero',
    'Febrero',
    'Marzo',
    'Abril',
    'Mayo',
    'Junio',
    'Julio',
    'Agosto',
    'Septiembre',
    'Octubre',
    'Noviembre',
    'Diciembre',
  ];
}

export function createExpenseDetailSeries(): IncomeStatementExpenseDetailDto[] {
  return (Object.values(ExpenseType) as ExpenseType[]).map((type) => ({
    type,
    accepted: 0,
    rejected: 0,
  }));
}

export function createMonthlySeries(year: number): IncomeStatementMonthDto[] {
  return getMonthLabels().map((label, index) => ({
    year,
    month: index + 1,
    label,
    salesIncome: 0,
    salesTax: 0,
    cogs: 0,
    grossProfit: 0,
    expenses: 0,
    rejectedExpenses: 0,
    purchases: 0,
    creditTax: 0,
    expenseDetail: createExpenseDetailSeries(),
    net: 0,
  }));
}

export function isExpenseCategory(
  category: FinancialMovementCategory,
): boolean {
  return (
    category === FinancialMovementCategory.GASTO_OPERACIONAL ||
    category === FinancialMovementCategory.GASTO_ADMINISTRATIVO ||
    category === FinancialMovementCategory.GASTO_FINANCIERO
  );
}

export function expenseTypeForCategory(
  category: FinancialMovementCategory,
): ExpenseType {
  switch (category) {
    case FinancialMovementCategory.GASTO_OPERACIONAL:
      return ExpenseType.OPERATIONAL;
    case FinancialMovementCategory.GASTO_ADMINISTRATIVO:
      return ExpenseType.ADMINISTRATIVE;
    case FinancialMovementCategory.GASTO_FINANCIERO:
      return ExpenseType.FINANCIAL;
    default:
      throw new Error(`Categoría ${category} no es un gasto`);
  }
}

export function buildTotals(
  months: IncomeStatementMonthDto[],
): IncomeStatementTotalsDto {
  return months.reduce(
    (acc, month) => ({
      salesIncome: toMoney(acc.salesIncome + month.salesIncome),
      salesTax: toMoney(acc.salesTax + month.salesTax),
      cogs: toMoney(acc.cogs + month.cogs),
      grossProfit: toMoney(acc.grossProfit + month.grossProfit),
      expenses: toMoney(acc.expenses + month.expenses),
      rejectedExpenses: toMoney(acc.rejectedExpenses + month.rejectedExpenses),
      purchases: toMoney(acc.purchases + month.purchases),
      creditTax: toMoney(acc.creditTax + month.creditTax),
      net: toMoney(acc.net + month.net),
    }),
    {
      salesIncome: 0,
      salesTax: 0,
      cogs: 0,
      grossProfit: 0,
      expenses: 0,
      rejectedExpenses: 0,
      purchases: 0,
      creditTax: 0,
      net: 0,
    },
  );
}

export function normalizeDates(
  from?: string,
  to?: string,
  timeZone: string = DEFAULT_TIMEZONE,
) {
  const now = new Date();
  const defaultFrom = getStartOfMonthInTimezone(now, timeZone);
  const defaultTo = getStartOfDayInTimezone(now, timeZone, 1);

  const fromDate = from ? new Date(from) : defaultFrom;
  const toDate = to ? new Date(to) : defaultTo;

  return { from: fromDate.toISOString(), to: toDate.toISOString() };
}

export function mergeGrouped(
  dteRows: Array<Record<string, unknown>>,
  saleRows: Array<Record<string, unknown>>,
): GroupedAggregate[] {
  const map = new Map<string, GroupedAggregate>();

  for (const row of dteRows) {
    map.set(String(row.key), {
      key: String(row.key),
      count: Number(row.count),
      total: Number(row.total),
    });
  }
  for (const row of saleRows) {
    const key = String(row.key);
    const current = map.get(key);
    if (current) {
      current.count += Number(row.count);
      current.total += Number(row.total);
    } else {
      map.set(key, {
        key,
        count: Number(row.count),
        total: Number(row.total),
      });
    }
  }

  return Array.from(map.values());
}

export function mergeSummary(
  dte: CountTotalAggregate,
  notes: CountTotalAggregate,
): CountTotalAggregate {
  return {
    count: dte.count + notes.count,
    total: dte.total + notes.total,
  };
}

export function serializeDocument(document: DteDocument): DteDocumentListItem {
  const payloadNormalized = document.payloadNormalized ?? {};
  const items = Array.isArray(payloadNormalized.items)
    ? (payloadNormalized.items as Array<Record<string, unknown>>)
    : [];

  return {
    dteDocumentID: document.dteDocumentID,
    token: document.token,
    folio: document.folio,
    status: document.status,
    paymentType: document.paymentType,
    total: Number(document.total),
    documentType: document.documentType,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    store: document.store
      ? {
          storeID: document.store.storeID,
          rut: document.store.rut,
          name: document.store.name,
          location: document.store.location,
        }
      : null,
    items,
    payloadNormalized,
  };
}

export function serializeSaleNote(sale: Sale): SaleListItem {
  const payloadNormalized = {
    saleType: sale.saleType,
    status: sale.status,
    subtotal: Number(sale.subtotal),
    discount: Number(sale.discount),
    netTotal: Number(sale.netTotal),
    taxTotal: Number(sale.taxTotal),
    cogsTotal: Number(sale.cogsTotal),
    receiver: sale.receiver ?? null,
    items: (sale.items ?? []).map((item) => ({
      saleItemID: item.saleItemID,
      storeProductID: item.storeProductID,
      variationID: item.variationID,
      productName: item.productName,
      sku: item.sku,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      unitCost: Number(item.unitCost),
      lineTotal: Number(item.lineTotal),
    })),
  };

  return {
    saleID: sale.saleID,
    dteDocumentID: sale.dteDocumentID,
    saleType: sale.saleType,
    token: null,
    folio: sale.folio,
    status: sale.status,
    paymentType: sale.paymentType,
    total: Number(sale.total),
    documentType: null,
    createdAt: sale.createdAt,
    updatedAt: sale.updatedAt,
    store: sale.store
      ? {
          storeID: sale.store.storeID,
          rut: sale.store.rut,
          name: sale.store.name,
          location: sale.store.location,
        }
      : null,
    items: payloadNormalized.items,
    payloadNormalized,
  };
}
