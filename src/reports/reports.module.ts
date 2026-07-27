import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { DteDocument } from '../dte/entities/dte-document.entity';
import { PurchaseOrder } from '../purchase-orders/entities/purchase-order.entity';
import { Expense } from '../expenses/entities/expense.entity';
import { MultitenantModule } from '../multitenant/multitenant.module';

@Module({
  imports: [MultitenantModule, TypeOrmModule.forFeature([DteDocument, PurchaseOrder, Expense])],
  providers: [ReportsService],
  controllers: [ReportsController],
  exports: [ReportsService],
})
export class ReportsModule {}

