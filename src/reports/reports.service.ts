import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  EntityManager,
  EntityTarget,
  ObjectLiteral,
  Repository,
} from 'typeorm';
import { DteDocument } from '../dte/entities/dte-document.entity';
import { FinancialMovement } from '../financial-movements/entities/financial-movement.entity';
import { IncomeStatementQueryDto } from './dto/income-statement-query.dto';
import { IncomeStatementDto } from './dto/income-statement.dto';
import { ReportsSaleFilterDto } from './dto/report-salesFilter.dto';
import { SalesReportResponseDto } from './dto/sales-report.dto';
import { TenantContextService } from '../multitenant/tenant-context.service';
import { Sale } from '../sales/entities/sale.entity';
import { TransactionRunnerService } from '../common/services/transaction-runner.service';
import { getYearBounds, normalizeDates } from './report-helpers';
import {
  aggregateDteCountAndTotal,
  aggregateMovements,
  aggregateSaleNoteCountAndTotal,
  fetchDocumentList,
  fetchDtePaymentBreakdown,
  fetchDteStatusBreakdown,
  fetchSaleNoteList,
  fetchSalePaymentBreakdown,
  fetchSaleStatusBreakdown,
} from './reports-repository.helpers';
import {
  buildIncomeStatementReport,
  buildPeriodBoundaries,
  buildSalesReportResult,
} from './reports-engine';

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

      const { months, totals } = buildIncomeStatementReport(rows, year);

      return {
        year,
        storeId: filter.storeId,
        months,
        totals,
      };
    });
  }

  async getSalesReport(
    filter: ReportsSaleFilterDto,
  ): Promise<SalesReportResponseDto> {
    return this.runInTransaction(async (manager) => {
      const dteRepo = manager.getRepository(DteDocument);
      const saleRepo = manager.getRepository(Sale);
      const { storeId, page = 1, limit = 50 } = filter;
      const { from, to } = normalizeDates(filter.from, filter.to);

      const [paymentRaw, statusRaw, salePaymentRaw, saleStatusRaw] =
        await Promise.all([
          fetchDtePaymentBreakdown(dteRepo, from, to, storeId),
          fetchDteStatusBreakdown(dteRepo, from, to, storeId),
          fetchSalePaymentBreakdown(saleRepo, from, to, storeId),
          fetchSaleStatusBreakdown(saleRepo, from, to, storeId),
        ]);

      const { todayStart, tomorrowStart, yesterdayStart, monthStart } =
        buildPeriodBoundaries(new Date());

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

      const [documents, total] = await fetchDocumentList(
        dteRepo,
        from,
        to,
        storeId,
        page * limit,
      );
      const [notes, notesTotal] = await fetchSaleNoteList(
        saleRepo,
        from,
        to,
        storeId,
        page * limit,
      );

      return buildSalesReportResult({
        paymentRaw,
        statusRaw,
        salePaymentRaw,
        saleStatusRaw,
        todaySummary,
        yesterdaySummary,
        monthSummary,
        todayNotes,
        yesterdayNotes,
        monthNotes,
        documents,
        notes,
        page,
        limit,
        total,
        notesTotal,
      });
    });
  }
}
