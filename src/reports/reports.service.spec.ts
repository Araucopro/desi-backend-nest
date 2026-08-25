import { ExpenseType } from '../expenses/entities/expense.entity';
import { ReportsService } from './reports.service';

type BuilderState = {
  alias: string;
  selects: Array<{ expr: string; as?: string }>;
  wheres: Array<{ expr: string; params?: Record<string, unknown> }>;
  groupByValue?: string;
};

function createRepositoryMock(
  rowsByAlias: Record<string, Array<Record<string, unknown>>>,
  options?: {
    rawOne?: Record<string, Record<string, unknown>>;
  },
) {
  const builders: BuilderState[] = [];

  const repository = {
    createQueryBuilder: jest.fn().mockImplementation((alias: string) => {
      const state: BuilderState = {
        alias,
        selects: [],
        wheres: [],
      };
      builders.push(state);

      const builder = {
        state,
        select(expr: string, as?: string) {
          state.selects.push({ expr, as });
          return this;
        },
        addSelect(expr: string, as?: string) {
          state.selects.push({ expr, as });
          return this;
        },
        where(expr: string, params?: Record<string, unknown>) {
          state.wheres.push({ expr, params });
          return this;
        },
        andWhere(expr: string, params?: Record<string, unknown>) {
          state.wheres.push({ expr, params });
          return this;
        },
        groupBy(value: string) {
          state.groupByValue = value;
          return this;
        },
        addGroupBy() {
          return this;
        },
        orderBy() {
          return this;
        },
        addOrderBy() {
          return this;
        },
        getRawMany: async () => rowsByAlias[alias] ?? [],
        getRawOne: async () =>
          options?.rawOne?.[alias] ?? { count: '0', total: '0' },
        leftJoinAndSelect() {
          return this;
        },
        skip() {
          return this;
        },
        take() {
          return this;
        },
        getManyAndCount: async () => [[], 0],
      };

      return builder;
    }),
    builders,
  };

  return repository;
}

function movementRow(overrides: Record<string, unknown>) {
  return {
    direction: 'EGRESO',
    taxCredit: false,
    acceptedForTax: true,
    total: '0',
    taxTotal: '0',
    ...overrides,
  };
}

function createSaleRepoMock(rows: Array<Record<string, unknown>> = []) {
  return createRepositoryMock({ sale: rows });
}

describe('ReportsService', () => {
  const fixedNow = new Date('2026-05-11T12:00:00.000Z');

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(fixedNow);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('builds the monthly income statement from the financial ledger', async () => {
    const documentsRepo = createRepositoryMock({ document: [] });
    const movementsRepo = createRepositoryMock({
      movement: [
        movementRow({
          month: '1',
          category: 'VENTA',
          direction: 'INGRESO',
          total: '100.50',
          taxTotal: '19.10',
        }),
        movementRow({
          month: '1',
          category: 'COSTO_VENTA',
          total: '60.00',
        }),
        movementRow({
          month: '1',
          category: 'COMPRA',
          taxCredit: true,
          total: '200.00',
          taxTotal: '38.00',
        }),
        movementRow({
          month: '1',
          category: 'GASTO_OPERACIONAL',
          taxCredit: true,
          total: '10.00',
          taxTotal: '1.90',
        }),
        movementRow({
          month: '1',
          category: 'GASTO_ADMINISTRATIVO',
          acceptedForTax: false,
          total: '5.00',
          taxTotal: '0.95',
        }),
        movementRow({
          month: '3',
          category: 'VENTA',
          direction: 'INGRESO',
          total: '75.25',
          taxTotal: '14.30',
        }),
      ],
    });

    const service = new ReportsService(
      documentsRepo as any,
      movementsRepo as any,
      createSaleRepoMock() as any,
    );

    const result = await service.getIncomeStatement({ year: 2026 });

    expect(result.year).toBe(2026);
    expect(result.months).toHaveLength(12);
    expect(result.months[0]).toMatchObject({
      month: 1,
      label: 'Enero',
      salesIncome: 100.5,
      salesTax: 19.1,
      cogs: 60,
      grossProfit: 40.5,
      expenses: 10,
      rejectedExpenses: 5,
      purchases: 200,
      creditTax: 39.9,
      expenseDetail: [
        { type: ExpenseType.FINANCIAL, accepted: 0, rejected: 0 },
        { type: ExpenseType.OPERATIONAL, accepted: 10, rejected: 0 },
        { type: ExpenseType.ADMINISTRATIVE, accepted: 0, rejected: 5 },
      ],
      net: 30.5,
    });
    expect(result.months[1]).toMatchObject({
      month: 2,
      salesIncome: 0,
      cogs: 0,
      expenses: 0,
      net: 0,
    });
    expect(result.months[2]).toMatchObject({
      month: 3,
      salesIncome: 75.25,
      salesTax: 14.3,
      net: 75.25,
    });
    expect(result.totals).toEqual({
      salesIncome: 175.75,
      salesTax: 33.4,
      cogs: 60,
      grossProfit: 115.75,
      expenses: 10,
      rejectedExpenses: 5,
      purchases: 200,
      creditTax: 39.9,
      net: 105.75,
    });
  });

  it('does not treat paid purchase orders as income', async () => {
    const documentsRepo = createRepositoryMock({ document: [] });
    const movementsRepo = createRepositoryMock({
      movement: [
        movementRow({
          month: '1',
          category: 'COMPRA',
          taxCredit: true,
          total: '500.00',
          taxTotal: '95.00',
        }),
      ],
    });

    const service = new ReportsService(
      documentsRepo as any,
      movementsRepo as any,
      createSaleRepoMock() as any,
    );
    const result = await service.getIncomeStatement({ year: 2026 });

    expect(result.months[0].salesIncome).toBe(0);
    expect(result.months[0].purchases).toBe(500);
    expect(result.months[0].creditTax).toBe(95);
    expect(result.months[0].net).toBe(0);
  });

  it('subtracts nota de crédito (documentType 61) from sales income', async () => {
    const documentsRepo = createRepositoryMock({ document: [] });
    const movementsRepo = createRepositoryMock({
      movement: [
        movementRow({
          month: '1',
          category: 'VENTA',
          direction: 'INGRESO',
          total: '-20.00',
          taxTotal: '-3.80',
        }),
      ],
    });

    const service = new ReportsService(
      documentsRepo as any,
      movementsRepo as any,
      createSaleRepoMock() as any,
    );
    const result = await service.getIncomeStatement({ year: 2026 });

    expect(result.months[0].salesIncome).toBe(-20);
    expect(result.months[0].salesTax).toBe(-3.8);
    expect(result.months[0].net).toBe(-20);
  });

  it('keeps rejected expenses out of net but reports them separately', async () => {
    const documentsRepo = createRepositoryMock({ document: [] });
    const movementsRepo = createRepositoryMock({
      movement: [
        movementRow({
          month: '1',
          category: 'GASTO_ADMINISTRATIVO',
          acceptedForTax: false,
          total: '5.00',
        }),
      ],
    });

    const service = new ReportsService(
      documentsRepo as any,
      movementsRepo as any,
      createSaleRepoMock() as any,
    );
    const result = await service.getIncomeStatement({ year: 2026 });

    expect(result.months[0].expenses).toBe(0);
    expect(result.months[0].rejectedExpenses).toBe(5);
    expect(result.months[0].net).toBe(0);
    expect(result.months[0].expenseDetail).toEqual([
      { type: ExpenseType.FINANCIAL, accepted: 0, rejected: 0 },
      { type: ExpenseType.OPERATIONAL, accepted: 0, rejected: 0 },
      { type: ExpenseType.ADMINISTRATIVE, accepted: 0, rejected: 5 },
    ]);
  });

  it('only accumulates credit tax when taxCredit is true', async () => {
    const documentsRepo = createRepositoryMock({ document: [] });
    const movementsRepo = createRepositoryMock({
      movement: [
        movementRow({
          month: '1',
          category: 'COMPRA',
          taxCredit: false,
          total: '100.00',
          taxTotal: '38.00',
        }),
        movementRow({
          month: '1',
          category: 'GASTO_OPERACIONAL',
          taxCredit: true,
          total: '10.00',
          taxTotal: '1.90',
        }),
      ],
    });

    const service = new ReportsService(
      documentsRepo as any,
      movementsRepo as any,
      createSaleRepoMock() as any,
    );
    const result = await service.getIncomeStatement({ year: 2026 });

    expect(result.months[0].creditTax).toBe(1.9);
  });

  it('applies the store filter to the ledger query', async () => {
    const documentsRepo = createRepositoryMock({ document: [] });
    const movementsRepo = createRepositoryMock({ movement: [] });

    const service = new ReportsService(
      documentsRepo as any,
      movementsRepo as any,
      createSaleRepoMock() as any,
    );

    await service.getIncomeStatement({
      year: 2026,
      storeId: 'store-1',
    });

    expect(movementsRepo.builders[0].wheres[1]).toEqual({
      expr: 'movement.storeID = :storeId',
      params: { storeId: 'store-1' },
    });
  });

  it('queries the ledger date, amount and grouping columns', async () => {
    const documentsRepo = createRepositoryMock({ document: [] });
    const movementsRepo = createRepositoryMock({ movement: [] });

    const service = new ReportsService(
      documentsRepo as any,
      movementsRepo as any,
      createSaleRepoMock() as any,
    );

    await service.getIncomeStatement({ year: 2026 });

    const builder = movementsRepo.builders[0];
    expect(builder.selects[0]).toEqual({
      expr: 'EXTRACT(MONTH FROM movement.date)',
      as: 'month',
    });
    expect(builder.selects[5]).toEqual({
      expr: 'COALESCE(SUM(movement.amount), 0)',
      as: 'total',
    });
    expect(builder.selects[6]).toEqual({
      expr: 'COALESCE(SUM(movement.taxAmount), 0)',
      as: 'taxTotal',
    });
    expect(builder.groupByValue).toBe('month');
  });

  it('excludes NCE 61 del conteo y resta su monto en los resúmenes DTE', async () => {
    const documentsRepo = createRepositoryMock(
      { document: [] },
      {
        rawOne: {
          document: { count: '2', total: '1000' },
        },
      },
    );
    const movementsRepo = createRepositoryMock({ movement: [] });
    const saleRepo = createRepositoryMock({ sale: [] });

    const service = new ReportsService(
      documentsRepo as any,
      movementsRepo as any,
      saleRepo as any,
    );

    await service.getSalesReport({});

    const summaryBuilder = documentsRepo.builders.find((builder) =>
      builder.selects.some((select) =>
        select.expr.includes('documentType = 61'),
      ),
    );

    expect(summaryBuilder).toBeDefined();
    expect(
      summaryBuilder!.selects.some((select) =>
        select.expr.includes(
          'CASE WHEN document.documentType = 61 THEN -document.total',
        ),
      ),
    ).toBe(true);
    expect(
      summaryBuilder!.selects.some((select) =>
        select.expr.includes('documentType IS DISTINCT FROM 61'),
      ),
    ).toBe(true);
  });

  it('defaults to the current year when year is omitted', async () => {
    const documentsRepo = createRepositoryMock({ document: [] });
    const movementsRepo = createRepositoryMock({ movement: [] });

    const service = new ReportsService(
      documentsRepo as any,
      movementsRepo as any,
      createSaleRepoMock() as any,
    );

    const result = await service.getIncomeStatement({});

    expect(result.year).toBe(2026);
  });

  it('merges notas de venta into the sales report without double counting', async () => {
    const documentsRepo = createRepositoryMock(
      {
        document: [{ key: 'Efectivo', count: '1', total: '1000' }],
      },
      {
        rawOne: {
          document: { count: '1', total: '1000' },
        },
      },
    );
    const movementsRepo = createRepositoryMock({ movement: [] });
    const saleRepo = createRepositoryMock(
      {
        sale: [
          { key: 'Efectivo', count: '2', total: '2500' },
          { key: 'EMITIDA', count: '2', total: '2500' },
        ],
      },
      {
        rawOne: {
          sale: { count: '2', total: '2500' },
        },
      },
    );

    const service = new ReportsService(
      documentsRepo as any,
      movementsRepo as any,
      saleRepo as any,
    );

    const result = await service.getSalesReport({});

    expect(result.groupedByPaymentType).toEqual([
      { key: 'Efectivo', count: 3, total: 3500 },
      { key: 'EMITIDA', count: 2, total: 2500 },
    ]);
    expect(result.groupedByStatus).toEqual([
      { key: 'Efectivo', count: 3, total: 3500 },
      { key: 'EMITIDA', count: 2, total: 2500 },
    ]);
    expect(result.periodSummary.today).toEqual({ count: 3, total: 3500 });
    expect(result.periodSummary.yesterday).toEqual({ count: 3, total: 3500 });
    expect(result.periodSummary.month).toEqual({ count: 3, total: 3500 });
    expect(result.meta).toEqual({ page: 1, limit: 50, total: 0 });
  });
});
