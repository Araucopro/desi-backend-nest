import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StoreMonthlyTargetsService } from './store-monthly-targets.service';
import { StoreMonthlyTargetsController } from './store-monthly-targets.controller';
import { StoreMonthlyTarget } from './entities/store-monthly-target.entity';
import { Store } from '../stores/entities/store.entity';

@Module({
  imports: [TypeOrmModule.forFeature([StoreMonthlyTarget, Store])],
  controllers: [StoreMonthlyTargetsController],
  providers: [StoreMonthlyTargetsService],
})
export class StoreMonthlyTargetsModule {}
