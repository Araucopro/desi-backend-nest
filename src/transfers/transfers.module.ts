import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StoreTransfer } from './entities/store-transfer.entity';
import { StoreTransferItem } from './entities/store-transfer-item.entity';
import { TransfersService } from './transfers.service';
import { TransfersController } from './transfers.controller';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([StoreTransfer, StoreTransferItem]),
    InventoryModule,
  ],
  controllers: [TransfersController],
  providers: [TransfersService],
  exports: [TypeOrmModule, TransfersService],
})
export class TransfersModule {}
