import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StoreMonthlyTargetsService } from './store-monthly-targets.service';
import { StoreMonthlyTargetsController } from './store-monthly-targets.controller';
import { StoreMonthlyTarget } from './entities/store-monthly-target.entity';
import { Store } from '../stores/entities/store.entity';
import { MultitenantModule } from '../multitenant/multitenant.module';
import { TransactionRunnerService } from '../common/services/transaction-runner.service';

@Module({
  imports: [
    MultitenantModule,
    TypeOrmModule.forFeature([StoreMonthlyTarget, Store]),
  ],
  controllers: [StoreMonthlyTargetsController],
  providers: [StoreMonthlyTargetsService, TransactionRunnerService],
})
export class StoreMonthlyTargetsModule {}
