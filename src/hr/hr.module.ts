import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { MultitenantModule } from '../multitenant/multitenant.module';
import { StoresModule } from '../stores/stores.module';
import { UsersModule } from '../users/users.module';
import { UserstoresModule } from '../relations/userstores/userstores.module';
import { UserStore } from '../relations/userstores/entities/userstore.entity';
import { Store } from '../stores/entities/store.entity';
import { User } from '../users/entities/user.entity';
import { AttendanceOverrideAuditLog } from './attendance-overrides/entities/attendance-override-audit-log.entity';
import { AttendanceOverride } from './attendance-overrides/entities/attendance-override.entity';
import {
  AttendanceOverridesController,
  AttendanceAuditLogController,
} from './attendance-overrides/attendance-overrides.controller';
import { AttendanceOverridesService } from './attendance-overrides/attendance-overrides.service';
import { AttendanceCalendarController } from './attendance-calendar/attendance-calendar.controller';
import { AttendanceCalendarService } from './attendance-calendar/attendance-calendar.service';
import { CalendarBuilderService } from './attendance-calendar/calendar-builder.service';
import { MonthlySummaryCalculatorService } from './attendance-calendar/monthly-summary-calculator.service';
import { RosterController } from './roster/roster.controller';
import { RosterService } from './roster/roster.service';
import { StoreClosure } from './store-closures/entities/store-closure.entity';
import { StoreClosuresController } from './store-closures/store-closures.controller';
import { StoreClosuresService } from './store-closures/store-closures.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Store,
      User,
      UserStore,
      StoreClosure,
      AttendanceOverride,
      AttendanceOverrideAuditLog,
    ]),
    AuthModule,
    MultitenantModule,
    StoresModule,
    UsersModule,
    UserstoresModule,
  ],
  controllers: [
    RosterController,
    StoreClosuresController,
    AttendanceOverridesController,
    AttendanceAuditLogController,
    AttendanceCalendarController,
  ],
  providers: [
    RosterService,
    StoreClosuresService,
    AttendanceOverridesService,
    CalendarBuilderService,
    MonthlySummaryCalculatorService,
    AttendanceCalendarService,
  ],
  exports: [RosterService, AttendanceCalendarService],
})
export class HrModule {}
