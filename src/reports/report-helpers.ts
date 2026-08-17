import { Repository } from 'typeorm';
import {
  DteDocument,
  DteDocumentStatus,
} from '../dte/entities/dte-document.entity';
import { ExpenseType } from '../expenses/entities/expense.entity';
import {
  FinancialMovement,
  FinancialMovementCategory,
  FinancialMovementDirection,
} from '../financial-movements/entities/financial-movement.entity';
import {
  IncomeStatementExpenseDetailDto,
  IncomeStatementMonthDto,
  IncomeStatementTotalsDto,
} from './dto/income-statement.dto';
import { Sale, SaleStatus, SaleType } from '../sales/entities/sale.entity';

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

export function toNumber(
  value: string | number | null | undefined,
): number {
  return Number(value ?? 0);
}

export function toMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function getYearBounds(year: number) {
  return {
    start: new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0)),
    end: new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0, 0)),
  };
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
  const monthLabels = getMonthLabels();
  return monthLabels.map((label, index) => ({
    month: index + 1,
    label,
    year,
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
  series: IncomeStatementMonthDto[],
): IncomeStatementTotalsDto {
  return series.reduce(
    (acc, month) => ({
      salesIncome: toMoney(acc.salesIncome + month.salesIncome),
      salesTax: toMoney(acc.salesTax + month.salesTax),
      cogs: toMoney(acc.cogs + month.cogs),
      grossProfit: toMoney(acc.grossProfit + month.grossProfit),
      expenses: toMoney(acc.expenses + month.expenses),
      rejectedExpenses: toMoney(
        acc.rejectedExpenses + month.rejectedExpenses,
      ),
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

export function normalizeDates(from?: string, to?: string) {
  const now = new Date();
  const defaultFrom = new Date(
    now.getFullYear(),
    now.getMonth(),
    1,
    0,
    0,
    0,
    0,
  );
  const defaultTo = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    0,
    0,
    0,
    0,
  );

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

export async function aggregateMovements(
  repo: Repository<FinancialMovement>,
  start: Date,
  end: Date,
  storeId?: string,
): Promise<FinancialMovementRow[]> {
  const qb = repo
    .createQueryBuilder('movement')
    .select('EXTRACT(MONTH FROM movement.date)', 'month')
    .addSelect('movement.category', 'category')
    .addSelect('movement.direction', 'direction')
    .addSelect('movement.taxCredit', 'taxCredit')
    .addSelect('movement.acceptedForTax', 'acceptedForTax')
    .addSelect('COALESCE(SUM(movement.amount), 0)', 'total')
    .addSelect('COALESCE(SUM(movement.taxAmount), 0)', 'taxTotal')
    .where('movement.date >= :start AND movement.date < :end', {
      start: start.toISOString(),
      end: end.toISOString(),
    });

  if (storeId) {
    qb.andWhere('movement.storeID = :storeId', { storeId });
  }

  return qb
    .groupBy('month')
    .addGroupBy('movement.category')
    .addGroupBy('movement.direction')
    .addGroupBy('movement.taxCredit')
    .addGroupBy('movement.acceptedForTax')
    .getRawMany();
}

export async function aggregateDteCountAndTotal(
  repo: Repository<DteDocument>,
  startIso: string,
  endIso: string,
  storeId?: string,
): Promise<CountTotalAggregate> {
  const qb = repo
    .createQueryBuilder('document')
    .select('COUNT(document.dteDocumentID)', 'count')
    .addSelect('COALESCE(SUM(document.total),0)', 'total')
    .where('document.createdAt >= :start AND document.createdAt < :end', {
      start: startIso,
      end: endIso,
    })
    .andWhere("document.status = 'EMITIDO'");

  if (storeId) qb.andWhere('document.storeID = :storeId', { storeId });

  const raw = await qb.getRawOne();
  return { count: Number(raw.count || 0), total: Number(raw.total || 0) };
}

export async function aggregateSaleNoteCountAndTotal(
  repo: Repository<Sale>,
  startIso: string,
  endIso: string,
  storeId?: string,
): Promise<CountTotalAggregate> {
  const qb = repo
    .createQueryBuilder('sale')
    .select('COUNT(sale.saleID)', 'count')
    .addSelect('COALESCE(SUM(sale.total),0)', 'total')
    .where('sale.createdAt >= :start AND sale.createdAt < :end', {
      start: startIso,
      end: endIso,
    })
    .andWhere('sale.status = :status', { status: SaleStatus.EMITIDA })
    .andWhere('sale.saleType = :saleType', {
      saleType: SaleType.NOTA_VENTA,
    });

  if (storeId) qb.andWhere('sale.storeID = :storeId', { storeId });

  const raw = await qb.getRawOne();
  return { count: Number(raw.count || 0), total: Number(raw.total || 0) };
}

export function serializeDocument(
  document: DteDocument,
): DteDocumentListItem {
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
