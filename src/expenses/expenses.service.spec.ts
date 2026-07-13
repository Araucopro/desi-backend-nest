import { Test, TestingModule } from '@nestjs/testing';
import { ExpensesService } from './expenses.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Expense, ExpenseType } from './entities/expense.entity';
import { Repository } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('ExpensesService', () => {
  let service: ExpensesService;
  let expenseRepository: Repository<Expense>;
  let expenseSummaryQueryBuilder: {
    select: jest.Mock;
    addSelect: jest.Mock;
    where: jest.Mock;
    groupBy: jest.Mock;
    addGroupBy: jest.Mock;
    orderBy: jest.Mock;
    addOrderBy: jest.Mock;
    getRawMany: jest.Mock;
  };

  const mockExpenseRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockExpense: Partial<Expense> = {
    id: 'expense-uuid-1',
    name: 'Office Rent',
    deductibleDate: new Date('2023-10-27T00:00:00Z'),
    amount: 1500.5,
    type: ExpenseType.ADMINISTRATIVE,
    store: { storeID: 'store-uuid-1' } as any,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const buildSummaryQueryBuilder = () => {
    const qb = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      addGroupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn(),
    };

    return qb;
  };

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-11T12:00:00Z'));
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    expenseSummaryQueryBuilder = buildSummaryQueryBuilder();
    mockExpenseRepository.createQueryBuilder.mockReturnValue(
      expenseSummaryQueryBuilder,
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpensesService,
        {
          provide: getRepositoryToken(Expense),
          useValue: mockExpenseRepository,
        },
      ],
    }).compile();

    service = module.get<ExpensesService>(ExpensesService);
    expenseRepository = module.get<Repository<Expense>>(
      getRepositoryToken(Expense),
    );
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create an expense', async () => {
      const createDto = {
        name: 'Office Supplies',
        deductibleDate: '2023-11-01T00:00:00Z',
        amount: 250.0,
        type: ExpenseType.OPERATIONAL,
        storeID: 'store-uuid-1',
      };

      mockExpenseRepository.create.mockReturnValue({ ...createDto });
      mockExpenseRepository.save.mockResolvedValue({
        id: 'new-expense-uuid',
        ...createDto,
      });

      const result = await service.create(createDto);

      expect(mockExpenseRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ store: { storeID: 'store-uuid-1' } }),
      );
      expect(mockExpenseRepository.save).toHaveBeenCalled();
      expect(result).toHaveProperty('id', 'new-expense-uuid');
    });

    it('should throw BadRequestException on save error', async () => {
      const createDto = {
        name: 'Bad Expense',
        deductibleDate: '2023-11-01T00:00:00Z',
        amount: 100,
        type: ExpenseType.FINANCIAL,
        storeID: 'store-uuid-1',
      };

      mockExpenseRepository.create.mockReturnValue(createDto);
      mockExpenseRepository.save.mockRejectedValue(new Error('Database error'));

      await expect(service.create(createDto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('findAll', () => {
    it('should return an array of expenses with store relation', async () => {
      mockExpenseRepository.find.mockResolvedValue([mockExpense]);

      const result = await service.findAll();

      expect(result).toEqual([mockExpense]);
      expect(mockExpenseRepository.find).toHaveBeenCalledWith({
        relations: ['store'],
      });
    });
  });

  describe('getSummary', () => {
    it('should return a month by month summary for the current year', async () => {
      expenseSummaryQueryBuilder.getRawMany.mockResolvedValue([
        { month: 1, type: ExpenseType.ADMINISTRATIVE, total: '100.50' },
        { month: 1, type: ExpenseType.OPERATIONAL, total: '50.25' },
        { month: 5, type: ExpenseType.FINANCIAL, total: '30' },
      ]);

      const result = await service.getSummary({});

      expect(mockExpenseRepository.createQueryBuilder).toHaveBeenCalledWith(
        'expense',
      );
      expect(expenseSummaryQueryBuilder.where).toHaveBeenCalledWith(
        'expense.deductibleDate >= :start AND expense.deductibleDate < :end',
        expect.objectContaining({
          start: '2026-01-01T00:00:00.000Z',
          end: '2027-01-01T00:00:00.000Z',
        }),
      );
      expect(expenseSummaryQueryBuilder.groupBy).toHaveBeenCalledWith('month');
      expect(expenseSummaryQueryBuilder.addGroupBy).toHaveBeenCalledWith(
        'expense.type',
      );
      expect(expenseSummaryQueryBuilder.orderBy).toHaveBeenCalledWith(
        'month',
        'ASC',
      );
      expect(expenseSummaryQueryBuilder.addOrderBy).toHaveBeenCalledWith(
        'expense.type',
        'ASC',
      );

      expect(result.year).toBe(2026);
      expect(result.months).toHaveLength(12);
      expect(result.months[0]).toEqual({
        month: 1,
        label: 'Enero',
        total: 150.75,
        byType: [
          { type: ExpenseType.FINANCIAL, total: 0 },
          { type: ExpenseType.OPERATIONAL, total: 50.25 },
          { type: ExpenseType.ADMINISTRATIVE, total: 100.5 },
        ],
      });
      expect(result.months[4]).toEqual({
        month: 5,
        label: 'Mayo',
        total: 30,
        byType: [
          { type: ExpenseType.FINANCIAL, total: 30 },
          { type: ExpenseType.OPERATIONAL, total: 0 },
          { type: ExpenseType.ADMINISTRATIVE, total: 0 },
        ],
      });
      expect(result.totals).toEqual({
        total: 180.75,
        byType: [
          { type: ExpenseType.FINANCIAL, total: 30 },
          { type: ExpenseType.OPERATIONAL, total: 50.25 },
          { type: ExpenseType.ADMINISTRATIVE, total: 100.5 },
        ],
      });
    });

    it('should return zeroed months when there are no expenses', async () => {
      expenseSummaryQueryBuilder.getRawMany.mockResolvedValue([]);

      const result = await service.getSummary({});

      expect(result.months).toHaveLength(12);
      expect(result.totals).toEqual({
        total: 0,
        byType: [
          { type: ExpenseType.FINANCIAL, total: 0 },
          { type: ExpenseType.OPERATIONAL, total: 0 },
          { type: ExpenseType.ADMINISTRATIVE, total: 0 },
        ],
      });
    });

    it('should include storeId in the filter when provided', async () => {
      expenseSummaryQueryBuilder.getRawMany.mockResolvedValue([]);

      await service.getSummary({
        storeId: '123e4567-e89b-12d3-a456-426614174000',
      });

      expect(expenseSummaryQueryBuilder.where).toHaveBeenCalledWith(
        'expense.deductibleDate >= :start AND expense.deductibleDate < :end AND expense.storeID = :storeId',
        expect.objectContaining({
          storeId: '123e4567-e89b-12d3-a456-426614174000',
        }),
      );
    });
  });

  describe('findOne', () => {
    it('should return an expense by ID', async () => {
      mockExpenseRepository.findOne.mockResolvedValue(mockExpense);

      const result = await service.findOne('expense-uuid-1');

      expect(result).toEqual(mockExpense);
      expect(mockExpenseRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'expense-uuid-1' },
        relations: ['store'],
      });
    });

    it('should throw NotFoundException if expense not found', async () => {
      mockExpenseRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('not-found')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update an expense', async () => {
      mockExpenseRepository.findOne.mockResolvedValue({ ...mockExpense });
      mockExpenseRepository.save.mockResolvedValue({
        ...mockExpense,
        name: 'Updated Office Rent',
      });

      const result = await service.update('expense-uuid-1', {
        name: 'Updated Office Rent',
      });

      expect(result.name).toBe('Updated Office Rent');
      expect(mockExpenseRepository.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException if expense to update not found', async () => {
      mockExpenseRepository.findOne.mockResolvedValue(null);

      await expect(
        service.update('not-found', { name: 'Test' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should remove an expense', async () => {
      mockExpenseRepository.findOne.mockResolvedValue(mockExpense);
      mockExpenseRepository.remove.mockResolvedValue(mockExpense);

      await service.remove('expense-uuid-1');

      expect(mockExpenseRepository.remove).toHaveBeenCalledWith(mockExpense);
    });

    it('should throw NotFoundException if expense to remove not found', async () => {
      mockExpenseRepository.findOne.mockResolvedValue(null);

      await expect(service.remove('not-found')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
