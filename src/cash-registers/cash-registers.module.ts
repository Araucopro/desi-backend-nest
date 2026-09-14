import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CashRegister } from './entities/cash-register.entity';
import { CashRegisterSession } from './entities/cash-register-session.entity';
import { CashMovement } from './entities/cash-movement.entity';
import { Payment } from './entities/payment.entity';
import { PaymentMethod } from './entities/payment-method.entity';
import { Store } from '../stores/entities/store.entity';
import { CashRegistersController } from './cash-registers.controller';
import { CashSessionsController } from './cash-sessions.controller';
import { PaymentMethodsController } from './payment-methods.controller';
import { CashRegistersService } from './cash-registers.service';
import { CashMovementsService } from './cash-movements.service';
import { PaymentsService } from './payments.service';
import { PaymentMethodsService } from './payment-methods.service';
import { UserstoresModule } from '../relations/userstores/userstores.module';
import { MultitenantModule } from '../multitenant/multitenant.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CashRegister,
      CashRegisterSession,
      CashMovement,
      Payment,
      PaymentMethod,
      Store,
    ]),
    UserstoresModule,
    MultitenantModule,
  ],
  controllers: [
    CashRegistersController,
    CashSessionsController,
    PaymentMethodsController,
  ],
  providers: [
    CashRegistersService,
    CashMovementsService,
    PaymentsService,
    PaymentMethodsService,
  ],
  exports: [CashRegistersService, PaymentsService, TypeOrmModule],
})
export class CashRegistersModule {}
