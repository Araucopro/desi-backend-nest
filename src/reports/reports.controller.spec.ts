import { Test, TestingModule } from '@nestjs/testing';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

describe('ReportsController', () => {
  let controller: ReportsController;
  const mockService = {
    getIncomeStatement: jest.fn().mockResolvedValue({ foo: 'bar' }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReportsController],
      providers: [{ provide: ReportsService, useValue: mockService }],
    }).compile();

    controller = module.get<ReportsController>(ReportsController);
  });

  it('delegates to the income statement service', async () => {
    expect(await controller.incomeStatement({} as any)).toEqual({ foo: 'bar' });
    expect(mockService.getIncomeStatement).toHaveBeenCalledWith({} as any);
  });
});
