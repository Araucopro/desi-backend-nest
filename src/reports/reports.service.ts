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
import { Sale, SaleStatus, SaleType } from '../sales/entities/sale.entity';
import { TransactionRunnerService } from '../common/services/transaction-runner.service';

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

type SaleListItem = {
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

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(DteDocument)
    private readonly dteDocumentRepository: Repository<DteDocument>,
    @InjectRepository(FinancialMovement)
    private readonly financialMovementRepository: Repository<FinancialMovement>,
    @InjectRepository(Sale)
    private readonly saleRepository: Repository<Sale>,
    @Optional() private readonly tenantContext?: TenantContextService,
    @Optional() private readonly transactionRunner?: TransactionRunnerService,
  ) {}

  private runInTransaction<T>(
    callback: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    if (this.transactionRunner) {
      return this.transactionRunner.run(callback, (cb) =>
        cb(this.buildFallbackManager()),
      );
    }

    if (this.tenantContext) {
      return this.tenantContext.transaction(callback);
    }

    return callback(this.buildFallbackManager());
  }

  private buildFallbackManager(): EntityManager {
    const manager = {
      getRepository: <T extends ObjectLiteral>(target: EntityTarget<T>) => {
        if (target === FinancialMovement) {
          return this.financialMovementRepository;
        }
        if (target === DteDocument) {
          return this.dteDocumentRepository;
        }
        if (target === Sale) {
          return this.saleRepository;
        }
        throw new Error('Repositorio no disponible fuera de contexto tenant');
      },
    } as unknown as EntityManager;
    return manager;
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

  private async aggregateDteCountAndTotal(
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

  private async aggregateSaleNoteCountAndTotal(
    repo: Repository<Sale>,
    startIso: string,
    endIso: string,
    storeId?: string,
  ) {
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

  private serializeSaleNote(sale: Sale): SaleListItem {
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

  private mergeGrouped(
    dteRows: Array<Record<string, unknown>>,
    saleRows: Array<Record<string, unknown>>,
  ) {
    const map = new Map<
      string,
      { key: string; count: number; total: number }
    >();

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

  async getSalesReport(filter: ReportsSaleFilterDto) {
    return this.runInTransaction(async (manager) => {
      const dteRepo = manager.getRepository(DteDocument);
      const saleRepo = manager.getRepository(Sale);
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

      const salePaymentQuery = saleRepo
        .createQueryBuilder('sale')
        .select('sale.paymentType', 'key')
        .addSelect('COUNT(sale.saleID)', 'count')
        .addSelect('SUM(sale.total)', 'total')
        .where('sale.createdAt >= :from AND sale.createdAt < :to', {
          from,
          to,
        })
        .andWhere('sale.status = :status', { status: SaleStatus.EMITIDA })
        .andWhere('sale.saleType = :saleType', {
          saleType: SaleType.NOTA_VENTA,
        });

      const saleStatusQuery = saleRepo
        .createQueryBuilder('sale')
        .select('sale.status', 'key')
        .addSelect('COUNT(sale.saleID)', 'count')
        .addSelect('SUM(sale.total)', 'total')
        .where('sale.createdAt >= :from AND sale.createdAt < :to', {
          from,
          to,
        })
        .andWhere('sale.status = :status', { status: SaleStatus.EMITIDA })
        .andWhere('sale.saleType = :saleType', {
          saleType: SaleType.NOTA_VENTA,
        });

      if (storeId) {
        paymentQuery.andWhere('document.storeID = :storeId', { storeId });
        statusQuery.andWhere('document.storeID = :storeId', { storeId });
        salePaymentQuery.andWhere('sale.storeID = :storeId', { storeId });
        saleStatusQuery.andWhere('sale.storeID = :storeId', { storeId });
      }

      const [paymentRaw, statusRaw, salePaymentRaw, saleStatusRaw] =
        await Promise.all([
          paymentQuery.groupBy('document.paymentType').getRawMany(),
          statusQuery.groupBy('document.status').getRawMany(),
          salePaymentQuery.groupBy('sale.paymentType').getRawMany(),
          saleStatusQuery.groupBy('sale.status').getRawMany(),
        ]);

      const groupedByPaymentType = this.mergeGrouped(
        paymentRaw,
        salePaymentRaw,
      );
      const groupedByStatus = this.mergeGrouped(statusRaw, saleStatusRaw);

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
        this.aggregateDteCountAndTotal(
          dteRepo,
          todayStart.toISOString(),
          tomorrowStart.toISOString(),
          storeId,
        ),
        this.aggregateDteCountAndTotal(
          dteRepo,
          yesterdayStart.toISOString(),
          todayStart.toISOString(),
          storeId,
        ),
        this.aggregateDteCountAndTotal(
          dteRepo,
          monthStart.toISOString(),
          tomorrowStart.toISOString(),
          storeId,
        ),
      ]);
      const [todayNotes, yesterdayNotes, monthNotes] = await Promise.all([
        this.aggregateSaleNoteCountAndTotal(
          saleRepo,
          todayStart.toISOString(),
          tomorrowStart.toISOString(),
          storeId,
        ),
        this.aggregateSaleNoteCountAndTotal(
          saleRepo,
          yesterdayStart.toISOString(),
          todayStart.toISOString(),
          storeId,
        ),
        this.aggregateSaleNoteCountAndTotal(
          saleRepo,
          monthStart.toISOString(),
          tomorrowStart.toISOString(),
          storeId,
        ),
      ]);

      const mergeSummary = (
        dte: { count: number; total: number },
        notes: { count: number; total: number },
      ) => ({
        count: dte.count + notes.count,
        total: dte.total + notes.total,
      });

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
        .skip(0)
        .take(page * limit)
        .getManyAndCount();

      const noteListQuery = saleRepo
        .createQueryBuilder('sale')
        .leftJoinAndSelect('sale.store', 'store')
        .leftJoinAndSelect('sale.items', 'items')
        .where('sale.createdAt >= :from AND sale.createdAt < :to', {
          from,
          to,
        })
        .andWhere('sale.status = :status', { status: SaleStatus.EMITIDA })
        .andWhere('sale.saleType = :saleType', {
          saleType: SaleType.NOTA_VENTA,
        });

      if (storeId)
        noteListQuery.andWhere('sale.storeID = :storeId', { storeId });

      const [notes, notesTotal] = await noteListQuery
        .orderBy('sale.createdAt', 'DESC')
        .skip(0)
        .take(page * limit)
        .getManyAndCount();

      const combined = [
        ...documents.map((document) => this.serializeDocument(document)),
        ...notes.map((note) => this.serializeSaleNote(note)),
      ]
        .sort(
          (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
        )
        .slice((page - 1) * limit, page * limit);

      return {
        groupedByPaymentType,
        groupedByStatus,
        periodSummary: {
          today: mergeSummary(todaySummary, todayNotes),
          yesterday: mergeSummary(yesterdaySummary, yesterdayNotes),
          month: mergeSummary(monthSummary, monthNotes),
        },
        sales: combined,
        meta: { page, limit, total: total + notesTotal },
      };
    });
  }
}
