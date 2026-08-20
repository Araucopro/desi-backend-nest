import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Expense, ExpenseType } from './entities/expense.entity';
import { EntityManager, Repository } from 'typeorm';
import {
  ExpenseSummaryDto,
  ExpenseMonthlySummaryMonthDto,
  ExpenseTypeSummaryDto,
} from './dto/expense-summary.dto';
import { ExpenseSummaryQueryDto } from './dto/expense-summary-query.dto';
import { TenantContextService } from '../multitenant/tenant-context.service';
import { FinancialMovementsService } from '../financial-movements/financial-movements.service';
import { TransactionRunnerService } from '../common/services/transaction-runner.service';
import { getYearBoundsInTimezone } from '../common/utils/date-timezone.util';

type ExpenseSummaryRow = {
  month: string | number;
  type: ExpenseType;
  total: string | number | null;
};

@Injectable()
export class ExpensesService {
  constructor(
    @InjectRepository(Expense)
    private readonly expenseRepository: Repository<Expense>,
    private readonly financialMovementsService: FinancialMovementsService,
    @Optional() private readonly tenantContext?: TenantContextService,
    @Optional() private readonly transactionRunner?: TransactionRunnerService,
  ) {}

  private runInTransaction<T>(
    callback: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    if (this.transactionRunner) {
      return this.transactionRunner.run(callback);
    }

    if (this.tenantContext) {
      return this.tenantContext.transaction(callback);
    }
    const manager = {
      getRepository: () => this.expenseRepository,
    } as unknown as EntityManager;
    return callback(manager);
  }

  async create(createExpenseDto: CreateExpenseDto) {
    try {
      const { storeID, ...expenseData } = createExpenseDto;
      return await this.runInTransaction(async (manager) => {
        const repo = manager.getRepository(Expense);
        const expense = repo.create({
          ...expenseData,
          amount: expenseData.netAmount + expenseData.taxAmount,
          store: { storeID },
        });
        const saved = await repo.save(expense);
        await this.financialMovementsService.recordExpense(manager, saved);
        return saved;
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Database error';
      throw new BadRequestException(message);
    }
  }

  async findAll() {
    const tenantId = this.tenantContext?.get(false)?.tenantId;
    const where = tenantId ? { tenantID: tenantId } : {};
    if (this.tenantContext) {
      return this.tenantContext.transaction((manager) =>
        manager.getRepository(Expense).find({ where, relations: ['store'] }),
      );
    }
    return await this.expenseRepository.find({
      where,
      relations: ['store'],
    });
  }

  private getYearBounds(year: number) {
    const timeZone = this.tenantContext?.getTimeZone() ?? 'America/Santiago';
    return getYearBoundsInTimezone(year, timeZone);
  }

  private toNumber(value: string | number | null | undefined) {
    return Number(value ?? 0);
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

  private createMonthlySeries(): ExpenseMonthlySummaryMonthDto[] {
    return this.getMonthLabels().map((label, index) => ({
      month: index + 1,
      label,
      total: 0,
      byType: (Object.values(ExpenseType) as ExpenseType[]).map((type) => ({
        type,
        total: 0,
      })),
    }));
  }

  async getSummary(filter: ExpenseSummaryQueryDto): Promise<ExpenseSummaryDto> {
    const runQuery = async (repo: Repository<Expense>) => {
      const year = new Date().getFullYear();
      const { start, end } = this.getYearBounds(year);
      const conditions = [
        'expense.deductibleDate >= :start AND expense.deductibleDate < :end',
      ];
      const parameters: Record<string, string> = {
        start: start.toISOString(),
        end: end.toISOString(),
      };

      if (filter.storeId) {
        conditions.push('expense.storeID = :storeId');
        parameters.storeId = filter.storeId;
      }

      const qb = repo
        .createQueryBuilder('expense')
        .select('EXTRACT(MONTH FROM expense.deductibleDate)', 'month')
        .addSelect('expense.type', 'type')
        .addSelect('COALESCE(SUM(expense.amount), 0)', 'total');

      qb.where(conditions.join(' AND '), parameters);

      const rows: ExpenseSummaryRow[] = await qb
        .groupBy('month')
        .addGroupBy('expense.type')
        .orderBy('month', 'ASC')
        .addOrderBy('expense.type', 'ASC')
        .getRawMany();

      const monthlySeries = this.createMonthlySeries();
      const monthlyMap = new Map<number, ExpenseMonthlySummaryMonthDto>(
        monthlySeries.map((month) => [month.month, month]),
      );
      const yearlyTotalsByType = new Map<ExpenseType, number>(
        (Object.values(ExpenseType) as ExpenseType[]).map((type) => [type, 0]),
      );

      for (const row of rows) {
        const monthNumber = Number(row.month);
        const month = monthlyMap.get(monthNumber);
        const amount = this.toNumber(row.total);

        if (!month) continue;

        const typeBucket = month.byType.find((item) => item.type === row.type);
        if (typeBucket) {
          typeBucket.total = amount;
        }

        month.total += amount;
        yearlyTotalsByType.set(
          row.type,
          (yearlyTotalsByType.get(row.type) ?? 0) + amount,
        );
      }

      const byType: ExpenseTypeSummaryDto[] = (
        Object.values(ExpenseType) as ExpenseType[]
      ).map((type) => ({
        type,
        total: yearlyTotalsByType.get(type) ?? 0,
      }));

      const total = monthlySeries.reduce((acc, month) => acc + month.total, 0);

      return {
        year,
        months: monthlySeries,
        totals: {
          total,
          byType,
        },
      };
    };

    if (this.tenantContext) {
      return this.tenantContext.transaction((manager) =>
        runQuery(manager.getRepository(Expense)),
      );
    }
    return runQuery(this.expenseRepository);
  }

  async findOne(id: string) {
    if (this.tenantContext) {
      const expense = await this.tenantContext.transaction((manager) =>
        manager
          .getRepository(Expense)
          .findOne({ where: { id }, relations: ['store'] }),
      );
      if (!expense) throw new NotFoundException('Expense not found');
      return expense;
    }
    const expense = await this.expenseRepository.findOne({
      where: { id },
      relations: ['store'],
    });
    if (!expense) throw new NotFoundException('Expense not found');
    return expense;
  }

  async update(id: string, updateExpenseDto: UpdateExpenseDto) {
    return this.runInTransaction(async (manager) => {
      const repo = manager.getRepository(Expense);
      const expense = await repo.findOne({
        where: { id },
        relations: ['store'],
      });
      if (!expense) throw new NotFoundException('Expense not found');

      const hasAmountFields =
        updateExpenseDto.netAmount !== undefined ||
        updateExpenseDto.taxAmount !== undefined;
      const updatedExpense = Object.assign(expense, updateExpenseDto);
      if (hasAmountFields) {
        updatedExpense.amount =
          (updatedExpense.netAmount ?? 0) + (updatedExpense.taxAmount ?? 0);
      }

      const saved = await repo.save(updatedExpense);
      await this.financialMovementsService.recordExpense(manager, saved);
      return saved;
    });
  }

  async remove(id: string) {
    return this.runInTransaction(async (manager) => {
      const repo = manager.getRepository(Expense);
      const expense = await repo.findOne({ where: { id } });
      if (!expense) throw new NotFoundException('Expense not found');

      const removed = await repo.remove(expense);
      await this.financialMovementsService.removeExpense(manager, expense.id);
      return removed;
    });
  }
}
