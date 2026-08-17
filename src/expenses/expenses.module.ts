import { Module } from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { ExpensesController } from './expenses.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Expense } from './entities/expense.entity';
import { MultitenantModule } from '../multitenant/multitenant.module';
import { FinancialMovementsModule } from '../financial-movements/financial-movements.module';
import { TransactionRunnerService } from '../common/services/transaction-runner.service';

@Module({
  imports: [
    MultitenantModule,
    FinancialMovementsModule,
    TypeOrmModule.forFeature([Expense]),
  ],
  controllers: [ExpensesController],
  providers: [ExpensesService, TransactionRunnerService],
  exports: [ExpensesService],
})
export class ExpensesModule {}
