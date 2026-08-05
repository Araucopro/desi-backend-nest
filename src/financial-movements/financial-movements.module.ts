import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FinancialMovement } from './entities/financial-movement.entity';
import { FinancialMovementsService } from './financial-movements.service';

@Module({
  imports: [TypeOrmModule.forFeature([FinancialMovement])],
  providers: [FinancialMovementsService],
  exports: [FinancialMovementsService],
})
export class FinancialMovementsModule {}
