import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { UserstoresService } from './userstores.service';
import { UserstoresController } from './userstores.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserStore } from './entities/userstore.entity';
import { UsersModule } from '../../users/users.module';
import { StoresModule } from '../../stores/stores.module';
import { MultitenantModule } from '../../multitenant/multitenant.module';
import { StoreContextGuard } from '../../common/guards/store-context.guard';
import { AuthModule } from '../../auth/auth.module';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([UserStore]),
    UsersModule,
    StoresModule,
    MultitenantModule,
    AuthModule,
  ],
  controllers: [UserstoresController],
  providers: [UserstoresService, StoreContextGuard],
  exports: [UserstoresService, StoreContextGuard, TypeOrmModule],
})
export class UserstoresModule {}
