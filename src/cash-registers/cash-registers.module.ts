import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CashRegister } from './entities/cash-register.entity';
import { CashRegisterSession } from './entities/cash-register-session.entity';
import { Store } from '../stores/entities/store.entity';
import { CashRegistersController } from './cash-registers.controller';
import { CashRegistersService } from './cash-registers.service';
import { UserstoresModule } from '../relations/userstores/userstores.module';
import { MultitenantModule } from '../multitenant/multitenant.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([CashRegister, CashRegisterSession, Store]),
    UserstoresModule,
    MultitenantModule,
  ],
  controllers: [CashRegistersController],
  providers: [CashRegistersService],
  exports: [CashRegistersService, TypeOrmModule],
})
export class CashRegistersModule {}
