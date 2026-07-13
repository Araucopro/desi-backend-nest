import { Module } from '@nestjs/common';
import { UsersModule } from './users/users.module';
import { DatabaseModule } from './datasource/database.module';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { StoresModule } from './stores/stores.module';
import { UserstoresModule } from './relations/userstores/userstores.module';
import { ProductsModule } from './products/products.module';
import { CategoriesModule } from './categories/categories.module';
import { StoreProductModule } from './relations/storeproduct/storeproduct.module';
import { SalesModule } from './sales/sales.module';
import { ReportsModule } from './reports/reports.module';
import { PurchaseOrdersModule } from './purchase-orders/purchase-orders.module';
import { ExpensesModule } from './expenses/expenses.module';
import { InventoryModule } from './inventory/inventory.module';
import { PricingModule } from './pricing/pricing.module';
import { TransfersModule } from './transfers/transfers.module';
import { SeedModule } from './seed/seed.module';
import { StoreMonthlyTargetsModule } from './store-monthly-targets/store-monthly-targets.module';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    UsersModule,
    StoresModule,
    UserstoresModule,
    ProductsModule,
    CategoriesModule,
    StoreProductModule,
    SalesModule,
    ReportsModule,
    PurchaseOrdersModule,
    ExpensesModule,
    InventoryModule,
    PricingModule,
    TransfersModule,
    SeedModule,
    StoreMonthlyTargetsModule,
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseInterceptor,
    },
  ],
})
export class AppModule {}
