import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CashRegister } from './entities/cash-register.entity';
import { CashRegisterSession } from './entities/cash-register-session.entity';
import { CashMovement } from './entities/cash-movement.entity';
import { Payment } from './entities/payment.entity';
import { PaymentMethod } from './entities/payment-method.entity';
import { CashMovementReason } from './entities/cash-movement-reason.entity';
import { CashRegisterClosing } from './entities/cash-register-closing.entity';
import { Store } from '../stores/entities/store.entity';
import { CashRegistersController } from './cash-registers.controller';
import { CashSessionsController } from './cash-sessions.controller';
import { PaymentMethodsController } from './payment-methods.controller';
import { CashMovementReasonsController } from './cash-movement-reasons.controller';
import { CashClosingsController } from './cash-closings.controller';
import { CashRegistersService } from './cash-registers.service';
import { CashMovementsService } from './cash-movements.service';
import { PaymentsService } from './payments.service';
import { PaymentMethodsService } from './payment-methods.service';
import { CashMovementReasonsService } from './cash-movement-reasons.service';
import { CashClosingsService } from './cash-closings.service';
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
      CashMovementReason,
      CashRegisterClosing,
      Store,
    ]),
    UserstoresModule,
    MultitenantModule,
  ],
  controllers: [
    CashRegistersController,
    CashSessionsController,
    PaymentMethodsController,
    CashMovementReasonsController,
    CashClosingsController,
  ],
  providers: [
    CashRegistersService,
    CashMovementsService,
    PaymentsService,
    PaymentMethodsService,
    CashMovementReasonsService,
    CashClosingsService,
  ],
  exports: [CashRegistersService, PaymentsService, TypeOrmModule],
})
export class CashRegistersModule {}
