import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from './entities/tenant.entity';
import { MasterUser } from './entities/master-user.entity';
import { AuditEvent } from './entities/audit-event.entity';
import { TenantContextService } from './tenant-context.service';
import { TenantContextGuard } from './tenant-context.guard';
import { TenantContextInterceptor } from './tenant-context.interceptor';
import { MasterService } from './master.service';
import { MasterController } from './master.controller';
import { JwtModule } from '@nestjs/jwt';
import { MasterAuthGuard } from '../auth/guards/master-auth.guard';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TenantSubscriber } from './tenant-subscriber';

const JWT_MODULE = JwtModule.registerAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    secret: config.get<string>('JWT_SECRET'),
  }),
});

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([Tenant, MasterUser, AuditEvent]),
    JWT_MODULE,
  ],
  controllers: [MasterController],
  providers: [
    TenantContextService,
    TenantContextGuard,
    TenantContextInterceptor,
    TenantSubscriber,
    MasterService,
    MasterAuthGuard,
  ],
  exports: [
    TypeOrmModule,
    JwtModule,
    TenantContextService,
    TenantContextGuard,
    TenantContextInterceptor,
    MasterService,
    MasterAuthGuard,
  ],
})
export class MultitenantModule {}

