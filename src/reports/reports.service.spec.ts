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
      };

      return builder;
    }),
    builders,
  };

  return repository;
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

  it('builds the monthly income statement with zero-filled months and totals', async () => {
    const salesRepo = createRepositoryMock({
      sale: [
        { month: '1', total: '100.50' },
        { month: '3', total: '75.25' },
      ],
    });
    const purchaseOrdersRepo = createRepositoryMock({
      purchaseOrder: [{ month: '1', total: '20.00' }],
    });
    const expensesRepo = createRepositoryMock({
      expense: [
        { month: '3', type: ExpenseType.OPERATIONAL, total: '6.00' },
        { month: '3', type: ExpenseType.ADMINISTRATIVE, total: '4.00' },
      ],
    });

    const service = new ReportsService(
      salesRepo as any,
      purchaseOrdersRepo as any,
      expensesRepo as any,
    );

    const result = await service.getIncomeStatement({ year: 2026 } as any);

    expect(result.year).toBe(2026);
    expect(result.months).toHaveLength(12);
    expect(result.months[0]).toMatchObject({
      month: 1,
      label: 'Enero',
      salesIncome: 100.5,
      purchaseOrdersIncome: 20,
      expenses: 0,
      expenseDetail: [
        { type: ExpenseType.FINANCIAL, total: 0 },
        { type: ExpenseType.OPERATIONAL, total: 0 },
        { type: ExpenseType.ADMINISTRATIVE, total: 0 },
      ],
      net: 120.5,
    });
    expect(result.months[1]).toMatchObject({
      month: 2,
      salesIncome: 0,
      purchaseOrdersIncome: 0,
      expenses: 0,
      net: 0,
    });
    expect(result.months[2]).toMatchObject({
      month: 3,
      salesIncome: 75.25,
      purchaseOrdersIncome: 0,
      expenses: 10,
      expenseDetail: [
        { type: ExpenseType.FINANCIAL, total: 0 },
        { type: ExpenseType.OPERATIONAL, total: 6 },
        { type: ExpenseType.ADMINISTRATIVE, total: 4 },
      ],
      net: 65.25,
    });
    expect(result.totals).toEqual({
      salesIncome: 175.75,
      purchaseOrdersIncome: 20,
      expenses: 10,
      net: 185.75,
    });
  });

  it('applies the store filter to every source', async () => {
    const salesRepo = createRepositoryMock({ sale: [] });
    const purchaseOrdersRepo = createRepositoryMock({ purchaseOrder: [] });
    const expensesRepo = createRepositoryMock({ expense: [] });

    const service = new ReportsService(
      salesRepo as any,
      purchaseOrdersRepo as any,
      expensesRepo as any,
    );

    await service.getIncomeStatement({
      year: 2026,
      storeId: 'store-1',
    } as any);

    for (const builder of [
      salesRepo.builders[0],
      purchaseOrdersRepo.builders[0],
      expensesRepo.builders[0],
    ]) {
      expect(builder.wheres[1]).toEqual({
        expr: `${builder.alias}.storeID = :storeId`,
        params: { storeId: 'store-1' },
      });
    }
  });

  it('filters only paid sales and purchase orders', async () => {
    const salesRepo = createRepositoryMock({ sale: [] });
    const purchaseOrdersRepo = createRepositoryMock({ purchaseOrder: [] });
    const expensesRepo = createRepositoryMock({ expense: [] });

    const service = new ReportsService(
      salesRepo as any,
      purchaseOrdersRepo as any,
      expensesRepo as any,
    );

    await service.getIncomeStatement({ year: 2026 } as any);

    expect(salesRepo.builders[0].wheres).toContainEqual({
      expr: "sale.status = 'Pagado'",
      params: undefined,
    });
    expect(purchaseOrdersRepo.builders[0].wheres).toContainEqual({
      expr: "purchaseOrder.paymentStatus = 'Pagado'",
      params: undefined,
    });
  });

  it('defaults to the current year when year is omitted', async () => {
    const salesRepo = createRepositoryMock({ sale: [] });
    const purchaseOrdersRepo = createRepositoryMock({ purchaseOrder: [] });
    const expensesRepo = createRepositoryMock({ expense: [] });

    const service = new ReportsService(
      salesRepo as any,
      purchaseOrdersRepo as any,
      expensesRepo as any,
    );

    const result = await service.getIncomeStatement({} as any);

    expect(result.year).toBe(2026);
  });

  it('queries the expected date and amount columns', async () => {
    const salesRepo = createRepositoryMock({ sale: [] });
    const purchaseOrdersRepo = createRepositoryMock({ purchaseOrder: [] });
    const expensesRepo = createRepositoryMock({ expense: [] });

    const service = new ReportsService(
      salesRepo as any,
      purchaseOrdersRepo as any,
      expensesRepo as any,
    );

    await service.getIncomeStatement({ year: 2026 } as any);

    expect(salesRepo.builders[0].selects[0]).toEqual({
      expr: 'EXTRACT(MONTH FROM sale.createdAt)',
      as: 'month',
    });
    expect(salesRepo.builders[0].selects[1]).toEqual({
      expr: 'COALESCE(SUM(sale.total), 0)',
      as: 'total',
    });

    expect(purchaseOrdersRepo.builders[0].selects[0]).toEqual({
      expr: 'EXTRACT(MONTH FROM purchaseOrder.issueDate)',
      as: 'month',
    });
    expect(purchaseOrdersRepo.builders[0].selects[1]).toEqual({
      expr: 'COALESCE(SUM(purchaseOrder.total), 0)',
      as: 'total',
    });

    expect(expensesRepo.builders[0].selects[0]).toEqual({
      expr: 'EXTRACT(MONTH FROM expense.deductibleDate)',
      as: 'month',
    });
    expect(expensesRepo.builders[0].selects[1]).toEqual({
      expr: 'expense.type',
      as: 'type',
    });
    expect(expensesRepo.builders[0].selects[2]).toEqual({
      expr: 'COALESCE(SUM(expense.amount), 0)',
      as: 'total',
    });
    expect(expensesRepo.builders[0].groupByValue).toBe('month');
  });

  it('aggregates expense detail by month and type', async () => {
    const salesRepo = createRepositoryMock({ sale: [] });
    const purchaseOrdersRepo = createRepositoryMock({ purchaseOrder: [] });
    const expensesRepo = createRepositoryMock({
      expense: [
        { month: '1', type: ExpenseType.FINANCIAL, total: '12.50' },
        { month: '1', type: ExpenseType.FINANCIAL, total: '2.50' },
        { month: '1', type: ExpenseType.OPERATIONAL, total: '5.00' },
      ],
    });

    const service = new ReportsService(
      salesRepo as any,
      purchaseOrdersRepo as any,
      expensesRepo as any,
    );

    const result = await service.getIncomeStatement({ year: 2026 } as any);

    expect(result.months[0].expenses).toBe(20);
    expect(result.months[0].expenseDetail).toEqual([
      { type: ExpenseType.FINANCIAL, total: 15 },
      { type: ExpenseType.OPERATIONAL, total: 5 },
      { type: ExpenseType.ADMINISTRATIVE, total: 0 },
    ]);
  });
});
