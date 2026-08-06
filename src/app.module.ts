import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { UsersModule } from './users/users.module';
import { DatabaseModule } from './datasource/database.module';
import { AuthModule } from './auth/auth.module';
import { AuthGuard } from './auth/guards/auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { TenantContextGuard } from './multitenant/tenant-context.guard';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { StoresModule } from './stores/stores.module';
import { UserstoresModule } from './relations/userstores/userstores.module';
import { ProductsModule } from './products/products.module';
import { CategoriesModule } from './categories/categories.module';
import { StoreProductModule } from './relations/storeproduct/storeproduct.module';
import { ReportsModule } from './reports/reports.module';
import { PurchaseOrdersModule } from './purchase-orders/purchase-orders.module';
import { ExpensesModule } from './expenses/expenses.module';
import { InventoryModule } from './inventory/inventory.module';
import { PricingModule } from './pricing/pricing.module';
import { TransfersModule } from './transfers/transfers.module';
import { SeedModule } from './seed/seed.module';
import { StoreMonthlyTargetsModule } from './store-monthly-targets/store-monthly-targets.module';
import { DteModule } from './dte/dte.module';
import { MultitenantModule } from './multitenant/multitenant.module';
import { TenantContextInterceptor } from './multitenant/tenant-context.interceptor';
import { SiiCodesModule } from './sii-codes/sii-codes.module';
import { FinancialMovementsModule } from './financial-movements/financial-movements.module';
import { SalesModule } from './sales/sales.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    DatabaseModule,
    AuthModule,
    UsersModule,
    StoresModule,
    UserstoresModule,
    ProductsModule,
    CategoriesModule,
    StoreProductModule,
    ReportsModule,
    PurchaseOrdersModule,
    ExpensesModule,
    InventoryModule,
    PricingModule,
    TransfersModule,
    SeedModule,
    StoreMonthlyTargetsModule,
    DteModule,
    MultitenantModule,
    FinancialMovementsModule,
    SiiCodesModule,
    SalesModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: TenantContextGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseInterceptor,
    },
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
  ],
})
export class AppModule {}
