import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { StoreMonthlyTargetsService } from './store-monthly-targets.service';
import { CreateStoreMonthlyTargetDto } from './dto/create-store-monthly-target.dto';
import { UpdateStoreMonthlyTargetDto } from './dto/update-store-monthly-target.dto';
import { StoreMonthlyTarget } from './entities/store-monthly-target.entity';
import { UpsertStoreMonthlyTargetDto } from './dto/upsert-store-monthly-target.dto';

@ApiTags('Metas Mensuales de Tienda')
@Controller('store-monthly-targets')
export class StoreMonthlyTargetsController {
  constructor(
    private readonly storeMonthlyTargetsService: StoreMonthlyTargetsService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear una meta mensual para una tienda' })
  @ApiResponse({
    status: 201,
    description: 'Meta mensual creada exitosamente.',
    type: StoreMonthlyTarget,
  })
  create(@Body() createDto: CreateStoreMonthlyTargetDto) {
    return this.storeMonthlyTargetsService.create(createDto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar todas las metas mensuales' })
  @ApiResponse({
    status: 200,
    description: 'Lista de metas mensuales.',
    type: [StoreMonthlyTarget],
  })
  findAll() {
    return this.storeMonthlyTargetsService.findAll();
  }

  @Get(':storeID')
  @Get(':storeID/:period')
  @ApiOperation({
    summary:
      'Obtener la meta mensual de una tienda por ID. period opcional: YYYY-MM-DD, YYYY-MM o YYYY/MM/DD, YYYY/MM',
  })
  @ApiParam({ name: 'storeID', description: 'ID de la tienda', type: String })
  @ApiParam({
    name: 'period',
    description:
      'Periodo opcional. Si no se envía, se usa el mes actual. Formatos aceptados: YYYY-MM-DD, YYYY-MM, YYYY/MM/DD, YYYY/MM',
    required: false,
    type: String,
  })
  @ApiResponse({
    status: 200,
    description: 'Meta mensual (0 si no existe).',
  })
  @ApiResponse({ status: 404, description: 'Tienda no encontrada.' })
  getByStore(
    @Param('storeID', ParseUUIDPipe) storeID: string,
    @Param('period') period?: string,
  ) {
    return this.storeMonthlyTargetsService.getTargetByStoreAndPeriod(
      storeID,
      period,
    );
  }

  @Post(':storeID')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Crear o actualizar la meta mensual para la tienda en el periodo dado (por defecto mes actual).',
  })
  @ApiParam({ name: 'storeID', description: 'ID de la tienda', type: String })
  @ApiResponse({
    status: 200,
    description: 'Meta creada o actualizada.',
    type: StoreMonthlyTarget,
  })
  upsert(
    @Param('storeID', ParseUUIDPipe) storeID: string,
    @Body() upsertDto: UpsertStoreMonthlyTargetDto,
  ) {
    return this.storeMonthlyTargetsService.upsertByStore(storeID, upsertDto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Actualizar una meta mensual',
    description: 'Solo permite editar metas del mes actual o de meses futuros.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID de la meta mensual',
    type: String,
  })
  @ApiResponse({
    status: 200,
    description: 'Meta mensual actualizada exitosamente.',
    type: StoreMonthlyTarget,
  })
  @ApiResponse({
    status: 400,
    description: 'La meta pertenece a un mes pasado o el payload es inválido.',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateDto: UpdateStoreMonthlyTargetDto,
  ) {
    return this.storeMonthlyTargetsService.update(id, updateDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Eliminar una meta mensual',
    description:
      'Solo permite eliminar metas del mes actual o de meses futuros.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID de la meta mensual',
    type: String,
  })
  @ApiResponse({
    status: 204,
    description: 'Meta mensual eliminada exitosamente.',
  })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.storeMonthlyTargetsService.remove(id);
  }
}
