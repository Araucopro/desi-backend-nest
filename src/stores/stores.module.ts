import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StoresService } from './stores.service';
import { StoresController } from './stores.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Store } from './entities/store.entity';
import { MultitenantModule } from '../multitenant/multitenant.module';
import { EncryptionService } from '../common/services/encryption.service';

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([Store]), MultitenantModule],
  controllers: [StoresController],
  providers: [StoresService, EncryptionService],
  exports: [StoresService],
})
export class StoresModule {}
