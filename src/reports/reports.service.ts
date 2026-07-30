import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import {
  DteDocument,
  DteDocumentStatus,
} from '../dte/entities/dte-document.entity';
import { PurchaseOrder } from '../purchase-orders/entities/purchase-order.entity';
import { Expense, ExpenseType } from '../expenses/entities/expense.entity';
import { IncomeStatementQueryDto } from './dto/income-statement-query.dto';
import {
  IncomeStatementExpenseDetailDto,
  IncomeStatementDto,
  IncomeStatementMonthDto,
} from './dto/income-statement.dto';
import { ReportsSaleFilterDto } from './dto/report-salesFilter.dto';
import { TenantContextService } from '../multitenant/tenant-context.service';

type MonthlyExpenseDetailRow = {
  month: string | number;
  type: ExpenseType;
  total: string | number | null;
};

type DteDocumentListItem = {
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

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(DteDocument)
    private readonly dteDocumentRepository: Repository<DteDocument>,
    @InjectRepository(PurchaseOrder)
    private readonly purchaseOrderRepository: Repository<PurchaseOrder>,
    @InjectRepository(Expense)
    private readonly expenseRepository: Repository<Expense>,
    @Optional() private readonly tenantContext?: TenantContextService,
  ) {}

  private runInTransaction<T>(
    callback: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    if (this.tenantContext) {
      return this.tenantContext.transaction(callback);
    }
    return callback(this.dteDocumentRepository.manager);
  }

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
    return this.runInTransaction(async (manager) => {
      const year = filter.year ?? new Date().getFullYear();
      const { start, end } = this.getYearBounds(year);

      const dteRepo = manager.getRepository(DteDocument);
      const poRepo = manager.getRepository(PurchaseOrder);
      const expRepo = manager.getRepository(Expense);

      const [salesByMonth, purchaseOrdersByMonth, expenseRows] =
        await Promise.all([
          this.aggregateMonthlyTotal(
            dteRepo,
            'document',
            'createdAt',
            'total',
            start,
            end,
            filter.storeId,
            "document.status = 'EMITIDO'",
          ),
          this.aggregateMonthlyTotal(
            poRepo,
            'purchaseOrder',
            'issueDate',
            'total',
            start,
            end,
            filter.storeId,
            "purchaseOrder.paymentStatus = 'Pagado'",
          ),
          (() => {
            const expenseQuery = expRepo
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
        const purchaseOrdersIncome =
          purchaseOrdersByMonth.get(month.month) ?? 0;
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
    });
  }

  private normalizeDates(from?: string, to?: string) {
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

  private async aggregateCountAndTotal(
    repo: Repository<DteDocument>,
    startIso: string,
    endIso: string,
    storeId?: string,
  ) {
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

  private serializeDocument(document: DteDocument): DteDocumentListItem {
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

  async getSalesReport(filter: ReportsSaleFilterDto) {
    return this.runInTransaction(async (manager) => {
      const dteRepo = manager.getRepository(DteDocument);
      const { storeId, page = 1, limit = 50 } = filter;
      const { from, to } = this.normalizeDates(filter.from, filter.to);

      const paymentQuery = dteRepo
        .createQueryBuilder('document')
        .select('document.paymentType', 'key')
        .addSelect('COUNT(document.dteDocumentID)', 'count')
        .addSelect('SUM(document.total)', 'total')
        .where('document.createdAt >= :from AND document.createdAt < :to', {
          from,
          to,
        })
        .andWhere("document.status = 'EMITIDO'");

      const statusQuery = dteRepo
        .createQueryBuilder('document')
        .select('document.status', 'key')
        .addSelect('COUNT(document.dteDocumentID)', 'count')
        .addSelect('SUM(document.total)', 'total')
        .where('document.createdAt >= :from AND document.createdAt < :to', {
          from,
          to,
        });

      if (storeId) {
        paymentQuery.andWhere('document.storeID = :storeId', { storeId });
        statusQuery.andWhere('document.storeID = :storeId', { storeId });
      }

      const [paymentRaw, statusRaw] = await Promise.all([
        paymentQuery.groupBy('document.paymentType').getRawMany(),
        statusQuery.groupBy('document.status').getRawMany(),
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
          dteRepo,
          todayStart.toISOString(),
          tomorrowStart.toISOString(),
          storeId,
        ),
        this.aggregateCountAndTotal(
          dteRepo,
          yesterdayStart.toISOString(),
          todayStart.toISOString(),
          storeId,
        ),
        this.aggregateCountAndTotal(
          dteRepo,
          monthStart.toISOString(),
          tomorrowStart.toISOString(),
          storeId,
        ),
      ]);

      const listQuery = dteRepo
        .createQueryBuilder('document')
        .leftJoinAndSelect('document.store', 'store')
        .where('document.createdAt >= :from AND document.createdAt < :to', {
          from,
          to,
        });

      if (storeId)
        listQuery.andWhere('document.storeID = :storeId', { storeId });

      const [documents, total] = await listQuery
        .orderBy('document.createdAt', 'DESC')
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
        sales: documents.map((document) => this.serializeDocument(document)),
        meta: { page, limit, total },
      };
    });
  }
}
