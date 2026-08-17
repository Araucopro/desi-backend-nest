import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StoreTransfer } from './entities/store-transfer.entity';
import { StoreTransferItem } from './entities/store-transfer-item.entity';
import { TransfersService } from './transfers.service';
import { TransfersController } from './transfers.controller';
import { InventoryModule } from '../inventory/inventory.module';
import { MultitenantModule } from '../multitenant/multitenant.module';
import { TransactionRunnerService } from '../common/services/transaction-runner.service';

@Module({
  imports: [
    MultitenantModule,
    TypeOrmModule.forFeature([StoreTransfer, StoreTransferItem]),
    InventoryModule,
  ],
  controllers: [TransfersController],
  providers: [TransfersService, TransactionRunnerService],
  exports: [TypeOrmModule, TransfersService],
})
export class TransfersModule {}
