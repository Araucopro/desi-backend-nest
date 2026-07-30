import { Module } from '@nestjs/common';
import { SiiCodesController } from './sii-codes.controller';
import { SiiCodesService } from './sii-codes.service';

@Module({
  controllers: [SiiCodesController],
  providers: [SiiCodesService],
  exports: [SiiCodesService],
})
export class SiiCodesModule {}
