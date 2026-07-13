import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Sale } from '../sales/entities/sale.entity';
import { PurchaseOrder } from '../purchase-orders/entities/purchase-order.entity';
import { Expense, ExpenseType } from '../expenses/entities/expense.entity';
import { IncomeStatementQueryDto } from './dto/income-statement-query.dto';
import {
  IncomeStatementExpenseDetailDto,
  IncomeStatementDto,
  IncomeStatementMonthDto,
} from './dto/income-statement.dto';
import { ReportsSaleFilterDto } from './dto/report-salesFilter.dto';

type MonthlyAggregateRow = {
  month: string;
  total: string | number | null;
};

type MonthlyExpenseDetailRow = {
  month: string | number;
  type: ExpenseType;
  total: string | number | null;
};

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Sale)
    private readonly saleRepository: Repository<Sale>,
    @InjectRepository(PurchaseOrder)
    private readonly purchaseOrderRepository: Repository<PurchaseOrder>,
    @InjectRepository(Expense)
    private readonly expenseRepository: Repository<Expense>,
  ) {}

  private getYearBounds(year: number) {
    return {
      start: new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0)),
      end: new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0, 0)),
    };
  }

  private getMonthLabels() {
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

  private toNumber(value: string | number | null | undefined) {
    return Number(value ?? 0);
  }

  private createMonthlySeries(year: number): IncomeStatementMonthDto[] {
    const monthLabels = this.getMonthLabels();
    return monthLabels.map((label, index) => ({
      month: index + 1,
      label,
      year,
      salesIncome: 0,
      purchaseOrdersIncome: 0,
      expenses: 0,
      expenseDetail: this.createExpenseDetailSeries(),
      net: 0,
    }));
  }

  private createExpenseDetailSeries(): IncomeStatementExpenseDetailDto[] {
    return (Object.values(ExpenseType) as ExpenseType[]).map((type) => ({
      type,
      total: 0,
    }));
  }

  private async aggregateMonthlyTotal<T>(
    repository: Repository<any>,
    alias: string,
    dateColumn: string,
    amountColumn: string,
    start: Date,
    end: Date,
    storeId?: string,
    extraWhere?: string,
  ) {
    const qb = repository
      .createQueryBuilder(alias)
      .select(`EXTRACT(MONTH FROM ${alias}.${dateColumn})`, 'month')
      .addSelect(`COALESCE(SUM(${alias}.${amountColumn}), 0)`, 'total')
      .where(
        `${alias}.${dateColumn} >= :start AND ${alias}.${dateColumn} < :end`,
        {
          start: start.toISOString(),
          end: end.toISOString(),
        },
      );

    if (storeId) {
      qb.andWhere(`${alias}.storeID = :storeId`, { storeId });
    }

    if (extraWhere) {
      qb.andWhere(extraWhere);
    }

    const rows = await qb.groupBy('month').getRawMany();
    return new Map<number, number>(
      rows.map((row) => [Number(row.month), this.toNumber(row.total)]),
    );
  }

  private buildTotals(series: IncomeStatementMonthDto[]) {
    return series.reduce(
      (acc, month) => ({
        salesIncome: acc.salesIncome + month.salesIncome,
        purchaseOrdersIncome:
          acc.purchaseOrdersIncome + month.purchaseOrdersIncome,
        expenses: acc.expenses + month.expenses,
        net: acc.net + month.net,
      }),
      {
        salesIncome: 0,
        purchaseOrdersIncome: 0,
        expenses: 0,
        net: 0,
      },
    );
  }

  async getIncomeStatement(
    filter: IncomeStatementQueryDto,
  ): Promise<IncomeStatementDto> {
    const year = filter.year ?? new Date().getFullYear();
    const { start, end } = this.getYearBounds(year);

    const [salesByMonth, purchaseOrdersByMonth, expenseRows] =
      await Promise.all([
        this.aggregateMonthlyTotal(
          this.saleRepository,
          'sale',
          'createdAt',
          'total',
          start,
          end,
          filter.storeId,
          "sale.status = 'Pagado'",
        ),
        this.aggregateMonthlyTotal(
          this.purchaseOrderRepository,
          'purchaseOrder',
          'issueDate',
          'total',
          start,
          end,
          filter.storeId,
          "purchaseOrder.paymentStatus = 'Pagado'",
        ),
        (() => {
          const expenseQuery = this.expenseRepository
            .createQueryBuilder('expense')
            .select('EXTRACT(MONTH FROM expense.deductibleDate)', 'month')
            .addSelect('expense.type', 'type')
            .addSelect('COALESCE(SUM(expense.amount), 0)', 'total')
            .where(
              'expense.deductibleDate >= :start AND expense.deductibleDate < :end',
              {
                start: start.toISOString(),
                end: end.toISOString(),
              },
            );

          if (filter.storeId) {
            expenseQuery.andWhere('expense.storeID = :storeId', {
              storeId: filter.storeId,
            });
          }

          return expenseQuery
            .groupBy('month')
            .addGroupBy('expense.type')
            .orderBy('month', 'ASC')
            .addOrderBy('expense.type', 'ASC')
            .getRawMany();
        })(),
      ]);

    const expensesByMonth = new Map<number, number>();
    const expenseDetailByMonth = new Map<
      number,
      IncomeStatementExpenseDetailDto[]
    >(
      this.createMonthlySeries(year).map((month) => [
        month.month,
        this.createExpenseDetailSeries(),
      ]),
    );

    for (const row of expenseRows as MonthlyExpenseDetailRow[]) {
      const monthNumber = Number(row.month);
      const amount = this.toNumber(row.total);

      expensesByMonth.set(
        monthNumber,
        (expensesByMonth.get(monthNumber) ?? 0) + amount,
      );

      const monthDetails = expenseDetailByMonth.get(monthNumber);
      const typeDetail = monthDetails?.find((item) => item.type === row.type);

      if (typeDetail) {
        typeDetail.total += amount;
      }
    }

    const months = this.createMonthlySeries(year).map((month) => {
      const salesIncome = salesByMonth.get(month.month) ?? 0;
      const purchaseOrdersIncome = purchaseOrdersByMonth.get(month.month) ?? 0;
      const expenses = expensesByMonth.get(month.month) ?? 0;
      const expenseDetail =
        expenseDetailByMonth.get(month.month) ??
        this.createExpenseDetailSeries();
      const net = salesIncome + purchaseOrdersIncome - expenses;

      return {
        ...month,
        salesIncome,
        purchaseOrdersIncome,
        expenses,
        expenseDetail,
        net,
      };
    });

    return {
      year,
      storeId: filter.storeId,
      months,
      totals: this.buildTotals(months),
    };
  }

  private normalizeDates(from?: string, to?: string) {
    const now = new Date();
    // Default from: first day of current month at 00:00
    const defaultFrom = new Date(
      now.getFullYear(),
      now.getMonth(),
      1,
      0,
      0,
      0,
      0,
    );
    // Default to: start of next day (exclusive) to include current day fully
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

  private async aggregateCountAndTotal(
    startIso: string,
    endIso: string,
    storeId?: string,
  ) {
    const qb = this.saleRepository
      .createQueryBuilder('sale')
      .select('COUNT(sale.saleID)', 'count')
      .addSelect('COALESCE(SUM(sale.total),0)', 'total')
      .where('sale.createdAt >= :start AND sale.createdAt < :end', {
        start: startIso,
        end: endIso,
      });

    if (storeId) qb.andWhere('sale.storeID = :storeId', { storeId });

    const raw = await qb.getRawOne();
    return { count: Number(raw.count || 0), total: Number(raw.total || 0) };
  }

  async getSalesReport(filter: ReportsSaleFilterDto) {
    const { storeId, page = 1, limit = 50 } = filter;
    const { from, to } = this.normalizeDates(filter.from, filter.to);

    // Aggregation by paymentType
    const paymentQuery = this.saleRepository
      .createQueryBuilder('sale')
      .select('sale.paymentType', 'key')
      .addSelect('COUNT(sale.saleID)', 'count')
      .addSelect('SUM(sale.total)', 'total')
      .where('sale.createdAt >= :from AND sale.createdAt < :to', { from, to });

    // Aggregation by status
    const statusQuery = this.saleRepository
      .createQueryBuilder('sale')
      .select('sale.status', 'key')
      .addSelect('COUNT(sale.saleID)', 'count')
      .addSelect('SUM(sale.total)', 'total')
      .where('sale.createdAt >= :from AND sale.createdAt < :to', { from, to });

    if (storeId) {
      paymentQuery.andWhere('sale.storeID = :storeId', { storeId });
      statusQuery.andWhere('sale.storeID = :storeId', { storeId });
    }

    const [paymentRaw, statusRaw] = await Promise.all([
      paymentQuery.groupBy('sale.paymentType').getRawMany(),
      statusQuery.groupBy('sale.status').getRawMany(),
    ]);

    const groupedByPaymentType = paymentRaw.map((r) => ({
      key: r.key,
      count: Number(r.count),
      total: Number(r.total),
    }));
    const groupedByStatus = statusRaw.map((r) => ({
      key: r.key,
      count: Number(r.count),
      total: Number(r.total),
    }));

    // Period summaries: today, yesterday, month (only counts and totals)
    const now = new Date();
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
    const monthStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      1,
      0,
      0,
      0,
      0,
    );

    const [todaySummary, yesterdaySummary, monthSummary] = await Promise.all([
      this.aggregateCountAndTotal(
        todayStart.toISOString(),
        tomorrowStart.toISOString(),
        storeId,
      ),
      this.aggregateCountAndTotal(
        yesterdayStart.toISOString(),
        todayStart.toISOString(),
        storeId,
      ),
      this.aggregateCountAndTotal(
        monthStart.toISOString(),
        tomorrowStart.toISOString(),
        storeId,
      ),
    ]);

    // Sales list with pagination
    const listQuery = this.saleRepository
      .createQueryBuilder('sale')
      .leftJoinAndSelect('sale.store', 'store')
      .leftJoinAndSelect('sale.saleProducts', 'saleProducts')
      .where('sale.createdAt >= :from AND sale.createdAt < :to', { from, to });

    if (storeId) listQuery.andWhere('sale.storeID = :storeId', { storeId });

    const [sales, total] = await listQuery
      .orderBy('sale.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      groupedByPaymentType,
      groupedByStatus,
      periodSummary: {
        today: todaySummary,
        yesterday: yesterdaySummary,
        month: monthSummary,
      },
      sales,
      meta: { page, limit, total },
    };
  }
}
