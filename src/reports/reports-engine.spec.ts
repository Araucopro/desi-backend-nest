import { DteDocumentStatus } from '../dte/entities/dte-document.entity';
import {
  FinancialMovementCategory,
  FinancialMovementDirection,
} from '../financial-movements/entities/financial-movement.entity';
import { ExpenseType } from '../expenses/entities/expense.entity';
import { SaleStatus, SaleType } from '../sales/entities/sale.entity';
import { FinancialMovementRow } from './report-helpers';
import {
  buildIncomeStatementReport,
  buildPeriodBoundaries,
  buildSalesReportResult,
} from './reports-engine';

function movementRow(overrides: Record<string, unknown>): FinancialMovementRow {
  return {
    month: 0,
    category: FinancialMovementCategory.VENTA,
    direction: FinancialMovementDirection.EGRESO,
    taxCredit: false,
    acceptedForTax: true,
    total: '0',
    taxTotal: '0',
    ...overrides,
  } as FinancialMovementRow;
}

describe('reports-engine', () => {
  it('builds the monthly income statement from financial rows', () => {
    const { months, totals } = buildIncomeStatementReport(
      [
        movementRow({
          month: '1',
          category: FinancialMovementCategory.VENTA,
          direction: FinancialMovementDirection.INGRESO,
          total: '100.50',
          taxTotal: '19.10',
        }),
        movementRow({
          month: '1',
          category: FinancialMovementCategory.COSTO_VENTA,
          total: '60.00',
        }),
        movementRow({
          month: '1',
          category: FinancialMovementCategory.COMPRA,
          taxCredit: true,
          total: '200.00',
          taxTotal: '38.00',
        }),
        movementRow({
          month: '1',
          category: FinancialMovementCategory.GASTO_OPERACIONAL,
          taxCredit: true,
          total: '10.00',
          taxTotal: '1.90',
        }),
        movementRow({
          month: '3',
          category: FinancialMovementCategory.VENTA,
          direction: FinancialMovementDirection.INGRESO,
          total: '75.25',
          taxTotal: '14.30',
        }),
      ],
      2026,
    );

    expect(months).toHaveLength(12);
    expect(months[0]).toMatchObject({
      month: 1,
      salesIncome: 100.5,
      salesTax: 19.1,
      cogs: 60,
      grossProfit: 40.5,
      expenses: 10,
      purchases: 200,
      creditTax: 39.9,
      net: 30.5,
    });
    expect(months[0].expenseDetail).toEqual(
      expect.arrayContaining([
        { type: ExpenseType.OPERATIONAL, accepted: 10, rejected: 0 },
      ]),
    );
    expect(months[2].salesIncome).toBe(75.25);
    expect(totals).toEqual({
      salesIncome: 175.75,
      salesTax: 33.4,
      cogs: 60,
      grossProfit: 115.75,
      expenses: 10,
      rejectedExpenses: 0,
      purchases: 200,
      creditTax: 39.9,
      net: 105.75,
    });
  });

  it('builds today, yesterday and month start boundaries', () => {
    const now = new Date(2026, 4, 11, 12, 30, 0, 0);
    const { todayStart, tomorrowStart, yesterdayStart, monthStart } =
      buildPeriodBoundaries(now);

    expect(todayStart).toEqual(new Date(2026, 4, 11, 0, 0, 0, 0));
    expect(tomorrowStart).toEqual(new Date(2026, 4, 12, 0, 0, 0, 0));
    expect(yesterdayStart).toEqual(new Date(2026, 4, 10, 0, 0, 0, 0));
    expect(monthStart).toEqual(new Date(2026, 4, 1, 0, 0, 0, 0));
  });

  it('merges DTE and sale aggregates, sorts documents and applies pagination', () => {
    const document = {
      dteDocumentID: 'dte-1',
      token: 'token-1',
      folio: 100,
      status: DteDocumentStatus.EMITIDO,
      paymentType: 'Efectivo',
      total: 1000,
      documentType: 33,
      createdAt: new Date('2026-08-06T10:00:00.000Z'),
      updatedAt: new Date('2026-08-06T10:00:00.000Z'),
      store: { storeID: 'store-1', rut: '1-9', name: 'Tienda', location: null },
      payloadNormalized: { items: [] },
    } as any;
    const note = {
      saleID: 'sale-1',
      dteDocumentID: null,
      saleType: SaleType.NOTA_VENTA,
      status: SaleStatus.EMITIDA,
      folio: 1,
      paymentType: 'Efectivo',
      total: 2500,
      subtotal: 2500,
      discount: 0,
      netTotal: 2100,
      taxTotal: 400,
      cogsTotal: 800,
      receiver: null,
      items: [],
      createdAt: new Date('2026-08-06T11:00:00.000Z'),
      updatedAt: new Date('2026-08-06T11:00:00.000Z'),
      store: { storeID: 'store-1', rut: '1-9', name: 'Tienda', location: null },
    } as any;

    const result = buildSalesReportResult({
      paymentRaw: [{ key: 'Efectivo', count: '1', total: '1000' }],
      statusRaw: [{ key: 'EMITIDO', count: '1', total: '1000' }],
      salePaymentRaw: [
        { key: 'Efectivo', count: '2', total: '2500' },
        { key: 'Debito', count: '1', total: '500' },
      ],
      saleStatusRaw: [{ key: 'EMITIDA', count: '2', total: '2500' }],
      todaySummary: { count: 1, total: 1000 },
      yesterdaySummary: { count: 0, total: 0 },
      monthSummary: { count: 3, total: 3500 },
      todayNotes: { count: 2, total: 2500 },
      yesterdayNotes: { count: 0, total: 0 },
      monthNotes: { count: 2, total: 2500 },
      documents: [document],
      notes: [note],
      page: 2,
      limit: 1,
      total: 1,
      notesTotal: 1,
    });

    expect(result.groupedByPaymentType).toEqual([
      { key: 'Efectivo', count: 3, total: 3500 },
      { key: 'Debito', count: 1, total: 500 },
    ]);
    expect(result.groupedByStatus).toEqual([
      { key: 'EMITIDO', count: 1, total: 1000 },
      { key: 'EMITIDA', count: 2, total: 2500 },
    ]);
    expect(result.periodSummary).toEqual({
      today: { count: 3, total: 3500 },
      yesterday: { count: 0, total: 0 },
      month: { count: 5, total: 6000 },
    });
    expect(result.sales).toEqual([
      expect.objectContaining({ dteDocumentID: 'dte-1' }),
    ]);
    expect(result.meta).toEqual({ page: 2, limit: 1, total: 2 });
  });
});
