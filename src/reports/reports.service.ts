import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  EntityManager,
  EntityTarget,
  ObjectLiteral,
  Repository,
} from 'typeorm';
import {
  DteDocument,
  DteDocumentStatus,
} from '../dte/entities/dte-document.entity';
import { Expense, ExpenseType } from '../expenses/entities/expense.entity';
import {
  FinancialMovement,
  FinancialMovementCategory,
  FinancialMovementDirection,
} from '../financial-movements/entities/financial-movement.entity';
import { IncomeStatementQueryDto } from './dto/income-statement-query.dto';
import {
  IncomeStatementExpenseDetailDto,
  IncomeStatementDto,
  IncomeStatementMonthDto,
} from './dto/income-statement.dto';
import { ReportsSaleFilterDto } from './dto/report-salesFilter.dto';
import { TenantContextService } from '../multitenant/tenant-context.service';

type FinancialMovementRow = {
  month: string | number;
  category: FinancialMovementCategory;
  direction: FinancialMovementDirection;
  taxCredit: boolean;
  acceptedForTax: boolean;
  total: string | number | null;
  taxTotal: string | number | null;
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
    @InjectRepository(FinancialMovement)
    private readonly financialMovementRepository: Repository<FinancialMovement>,
    @Optional() private readonly tenantContext?: TenantContextService,
  ) {}

  private runInTransaction<T>(
    callback: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    if (this.tenantContext) {
      return this.tenantContext.transaction(callback);
    }
    const manager = {
      getRepository: <T extends ObjectLiteral>(target: EntityTarget<T>) => {
        if (target === FinancialMovement) {
          return this.financialMovementRepository;
        }
        if (target === DteDocument) {
          return this.dteDocumentRepository;
        }
        throw new Error('Repositorio no disponible fuera de contexto tenant');
      },
    } as unknown as EntityManager;
    return callback(manager);
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

  private toMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private createMonthlySeries(year: number): IncomeStatementMonthDto[] {
    const monthLabels = this.getMonthLabels();
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
      expenseDetail: this.createExpenseDetailSeries(),
      net: 0,
    }));
  }

  private createExpenseDetailSeries(): IncomeStatementExpenseDetailDto[] {
    return (Object.values(ExpenseType) as ExpenseType[]).map((type) => ({
      type,
      accepted: 0,
      rejected: 0,
    }));
  }

  private async aggregateMovements(
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

  private isExpenseCategory(category: FinancialMovementCategory): boolean {
    return (
      category === FinancialMovementCategory.GASTO_OPERACIONAL ||
      category === FinancialMovementCategory.GASTO_ADMINISTRATIVO ||
      category === FinancialMovementCategory.GASTO_FINANCIERO
    );
  }

  private expenseTypeForCategory(
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

  private buildTotals(series: IncomeStatementMonthDto[]) {
    return series.reduce(
      (acc, month) => ({
        salesIncome: this.toMoney(acc.salesIncome + month.salesIncome),
        salesTax: this.toMoney(acc.salesTax + month.salesTax),
        cogs: this.toMoney(acc.cogs + month.cogs),
        grossProfit: this.toMoney(acc.grossProfit + month.grossProfit),
        expenses: this.toMoney(acc.expenses + month.expenses),
        rejectedExpenses: this.toMoney(
          acc.rejectedExpenses + month.rejectedExpenses,
        ),
        purchases: this.toMoney(acc.purchases + month.purchases),
        creditTax: this.toMoney(acc.creditTax + month.creditTax),
        net: this.toMoney(acc.net + month.net),
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

  async getIncomeStatement(
    filter: IncomeStatementQueryDto,
  ): Promise<IncomeStatementDto> {
    return this.runInTransaction(async (manager) => {
      const year = filter.year ?? new Date().getFullYear();
      const { start, end } = this.getYearBounds(year);

      const movementRepo = manager.getRepository(FinancialMovement);
      const rows = await this.aggregateMovements(
        movementRepo,
        start,
        end,
        filter.storeId,
      );

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
        this.createMonthlySeries(year).map((month) => [
          month.month,
          this.createExpenseDetailSeries(),
        ]),
      );

      for (const row of rows) {
        const monthNumber = Number(row.month);
        const amount = this.toNumber(row.total);
        const taxAmount = this.toNumber(row.taxTotal);
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

        if (this.isExpenseCategory(category)) {
          const type = this.expenseTypeForCategory(category);
          const monthDetails =
            expenseDetailByMonth.get(monthNumber) ??
            this.createExpenseDetailSeries();
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

      const months = this.createMonthlySeries(year).map((month) => {
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
          salesIncome: this.toMoney(salesIncome),
          salesTax: this.toMoney(salesTax),
          cogs: this.toMoney(cogs),
          grossProfit: this.toMoney(grossProfit),
          expenses: this.toMoney(expenses),
          rejectedExpenses: this.toMoney(rejectedExpenses),
          purchases: this.toMoney(purchases),
          creditTax: this.toMoney(creditTax),
          expenseDetail:
            expenseDetailByMonth.get(month.month) ??
            this.createExpenseDetailSeries(),
          net: this.toMoney(net),
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
