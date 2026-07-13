import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Expense, ExpenseType } from './entities/expense.entity';
import { Repository } from 'typeorm';
import {
  ExpenseSummaryDto,
  ExpenseMonthlySummaryMonthDto,
  ExpenseMonthlySummaryTotalsDto,
  ExpenseTypeSummaryDto,
} from './dto/expense-summary.dto';
import { ExpenseSummaryQueryDto } from './dto/expense-summary-query.dto';

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
  ) {}

  async create(createExpenseDto: CreateExpenseDto) {
    try {
      const { storeID, ...expenseData } = createExpenseDto;
      const expense = this.expenseRepository.create({
        ...expenseData,
        store: { storeID },
      });
      return await this.expenseRepository.save(expense);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Database error';
      throw new BadRequestException(message);
    }
  }

  async findAll() {
    return await this.expenseRepository.find({
      relations: ['store'],
    });
  }

  private getYearBounds(year: number) {
    return {
      start: new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0)),
      end: new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0, 0)),
    };
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

    const qb = this.expenseRepository
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

      if (!month) {
        continue;
      }

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
      } as ExpenseMonthlySummaryTotalsDto,
    };
  }

  async findOne(id: string) {
    const expense = await this.expenseRepository.findOne({
      where: { id },
      relations: ['store'],
    });
    if (!expense) throw new NotFoundException('Expense not found');
    return expense;
  }

  async update(id: string, updateExpenseDto: UpdateExpenseDto) {
    const expense = await this.findOne(id);
    const updatedExpense = Object.assign(expense, updateExpenseDto);
    return await this.expenseRepository.save(updatedExpense);
  }

  async remove(id: string) {
    const expense = await this.findOne(id);
    return await this.expenseRepository.remove(expense);
  }
}
