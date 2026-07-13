import { Module } from '@nestjs/common';
import { UserstoresService } from './userstores.service';
import { UserstoresController } from './userstores.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserStore } from './entities/userstore.entity';
import { UsersModule } from '../../users/users.module';
import { StoresModule } from '../../stores/stores.module';

@Module({
  imports: [TypeOrmModule.forFeature([UserStore]), UsersModule, StoresModule],
  controllers: [UserstoresController],
  providers: [UserstoresService],
  exports: [UserstoresService],
})
export class UserstoresModule {}
