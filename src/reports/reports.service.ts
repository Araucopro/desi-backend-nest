import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  EntityManager,
  EntityTarget,
  ObjectLiteral,
  Repository,
} from 'typeorm';
import { DteDocument } from '../dte/entities/dte-document.entity';
import {
  FinancialMovement,
  FinancialMovementCategory,
} from '../financial-movements/entities/financial-movement.entity';
import { IncomeStatementQueryDto } from './dto/income-statement-query.dto';
import {
  IncomeStatementDto,
  IncomeStatementExpenseDetailDto,
} from './dto/income-statement.dto';
import { ReportsSaleFilterDto } from './dto/report-salesFilter.dto';
import { TenantContextService } from '../multitenant/tenant-context.service';
import { Sale, SaleStatus, SaleType } from '../sales/entities/sale.entity';
import { TransactionRunnerService } from '../common/services/transaction-runner.service';
import {
  aggregateDteCountAndTotal,
  aggregateMovements,
  aggregateSaleNoteCountAndTotal,
  buildTotals,
  createExpenseDetailSeries,
  createMonthlySeries,
  expenseTypeForCategory,
  getYearBounds,
  isExpenseCategory,
  mergeGrouped,
  mergeSummary,
  normalizeDates,
  serializeDocument,
  serializeSaleNote,
  toMoney,
  toNumber,
} from './report-helpers';

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

  async getIncomeStatement(
    filter: IncomeStatementQueryDto,
  ): Promise<IncomeStatementDto> {
    return this.runInTransaction(async (manager) => {
      const year = filter.year ?? new Date().getFullYear();
      const { start, end } = getYearBounds(year);

      const movementRepo = manager.getRepository(FinancialMovement);
      const rows = await aggregateMovements(
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
            expenseDetailByMonth.get(monthNumber) ??
            createExpenseDetailSeries();
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
            expenseDetailByMonth.get(month.month) ??
            createExpenseDetailSeries(),
          net: toMoney(net),
        };
      });

      return {
        year,
        storeId: filter.storeId,
        months,
        totals: buildTotals(months),
      };
    });
  }

  async getSalesReport(filter: ReportsSaleFilterDto) {
    return this.runInTransaction(async (manager) => {
      const dteRepo = manager.getRepository(DteDocument);
      const saleRepo = manager.getRepository(Sale);
      const { storeId, page = 1, limit = 50 } = filter;
      const { from, to } = normalizeDates(filter.from, filter.to);

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

      const groupedByPaymentType = mergeGrouped(
        paymentRaw,
        salePaymentRaw,
      );
      const groupedByStatus = mergeGrouped(statusRaw, saleStatusRaw);

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
        aggregateDteCountAndTotal(
          dteRepo,
          todayStart.toISOString(),
          tomorrowStart.toISOString(),
          storeId,
        ),
        aggregateDteCountAndTotal(
          dteRepo,
          yesterdayStart.toISOString(),
          todayStart.toISOString(),
          storeId,
        ),
        aggregateDteCountAndTotal(
          dteRepo,
          monthStart.toISOString(),
          tomorrowStart.toISOString(),
          storeId,
        ),
      ]);
      const [todayNotes, yesterdayNotes, monthNotes] = await Promise.all([
        aggregateSaleNoteCountAndTotal(
          saleRepo,
          todayStart.toISOString(),
          tomorrowStart.toISOString(),
          storeId,
        ),
        aggregateSaleNoteCountAndTotal(
          saleRepo,
          yesterdayStart.toISOString(),
          todayStart.toISOString(),
          storeId,
        ),
        aggregateSaleNoteCountAndTotal(
          saleRepo,
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
        ...documents.map((document) => serializeDocument(document)),
        ...notes.map((note) => serializeSaleNote(note)),
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
