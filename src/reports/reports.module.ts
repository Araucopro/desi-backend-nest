import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { DteDocument } from '../dte/entities/dte-document.entity';
import { MultitenantModule } from '../multitenant/multitenant.module';
import { FinancialMovement } from '../financial-movements/entities/financial-movement.entity';

@Module({
  imports: [
    MultitenantModule,
    TypeOrmModule.forFeature([DteDocument, FinancialMovement]),
  ],
  providers: [ReportsService],
  controllers: [ReportsController],
  exports: [ReportsService],
})
export class ReportsModule {}
