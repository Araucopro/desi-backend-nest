import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { MultitenantModule } from '../multitenant/multitenant.module';
import { Role } from '../roles/entities/role.entity';
import { InventoryColumnPreference } from './entities/inventory-column-preference.entity';
import { InventoryColumnPreferencesService } from './inventory-column-preferences.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Role, InventoryColumnPreference]),
    MultitenantModule,
  ],
  controllers: [UsersController],
  providers: [UsersService, InventoryColumnPreferencesService],
  exports: [UsersService],
})
export class UsersModule {}
