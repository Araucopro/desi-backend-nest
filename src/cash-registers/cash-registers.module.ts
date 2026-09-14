import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CashRegister } from './entities/cash-register.entity';
import { CashRegisterSession } from './entities/cash-register-session.entity';
import { CashMovement } from './entities/cash-movement.entity';
import { Payment } from './entities/payment.entity';
import { PaymentMethod } from './entities/payment-method.entity';
import { CashMovementReason } from './entities/cash-movement-reason.entity';
import { CashRegisterClosing } from './entities/cash-register-closing.entity';
import { CashRegisterSessionUser } from './entities/cash-register-session-user.entity';
import { CashDenomination } from './entities/cash-denomination.entity';
import { CashCount } from './entities/cash-count.entity';
import { CashCountItem } from './entities/cash-count-item.entity';
import { Store } from '../stores/entities/store.entity';
import { User } from '../users/entities/user.entity';
import { UserStore } from '../relations/userstores/entities/userstore.entity';
import { CashRegistersController } from './cash-registers.controller';
import { CashSessionsController } from './cash-sessions.controller';
import { PaymentMethodsController } from './payment-methods.controller';
import { CashMovementReasonsController } from './cash-movement-reasons.controller';
import { CashClosingsController } from './cash-closings.controller';
import { CashRegisterSessionUsersController } from './cash-register-session-users.controller';
import { CashDenominationsController } from './cash-denominations.controller';
import { CashCountsController } from './cash-counts.controller';
import { CashRegistersService } from './cash-registers.service';
import { CashMovementsService } from './cash-movements.service';
import { PaymentsService } from './payments.service';
import { PaymentMethodsService } from './payment-methods.service';
import { CashMovementReasonsService } from './cash-movement-reasons.service';
import { CashClosingsService } from './cash-closings.service';
import { CashRegisterSessionUsersService } from './cash-register-session-users.service';
import { CashDenominationsService } from './cash-denominations.service';
import { CashCountsService } from './cash-counts.service';
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
      CashRegisterSessionUser,
      CashDenomination,
      CashCount,
      CashCountItem,
      Store,
      User,
      UserStore,
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
    CashRegisterSessionUsersController,
    CashDenominationsController,
    CashCountsController,
  ],
  providers: [
    CashRegistersService,
    CashMovementsService,
    PaymentsService,
    PaymentMethodsService,
    CashMovementReasonsService,
    CashClosingsService,
    CashRegisterSessionUsersService,
    CashDenominationsService,
    CashCountsService,
  ],
  exports: [CashRegistersService, PaymentsService, TypeOrmModule],
})
export class CashRegistersModule {}
