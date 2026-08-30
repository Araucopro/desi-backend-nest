import { Controller, Get, UseGuards } from '@nestjs/common';
import { SeedService } from './seed.service';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { MasterAuthGuard } from '../auth/guards/master-auth.guard';
import { MasterRoute } from '../auth/decorators/master.decorator';

@ApiTags('Seed (Datos de Prueba)')
@Controller('seed')
@UseGuards(MasterAuthGuard)
@MasterRoute()
export class SeedController {
  constructor(private readonly seedService: SeedService) {}

  @Get()
  @ApiOperation({
    summary: 'Ejecutar carga de datos masiva (Restringido a usuario MASTER)',
  })
  @ApiResponse({
    status: 200,
    description: 'Datos cargados correctamente',
    schema: {
      example: {
        statusCode: 200,
        message: 'Operación exitosa',
        error: null,
        data: 'SEED EXECUTED SUCCESSFULLY',
      },
    },
  })
  executeSeed() {
    return this.seedService.runSeed();
  }
}
