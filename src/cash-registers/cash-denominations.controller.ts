import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CustomMessage } from '../common/decorators/response-message';
import { CashDenominationsService } from './cash-denominations.service';
import { CreateCashDenominationDto } from './dto/create-cash-denomination.dto';
import { QueryCashDenominationsDto } from './dto/query-cash-denominations.dto';
import { UpdateCashDenominationDto } from './dto/update-cash-denomination.dto';
import { CashDenomination } from './entities/cash-denomination.entity';

@ApiTags('Denominaciones de efectivo')
@Controller('cash-denominations')
export class CashDenominationsController {
  constructor(
    private readonly cashDenominationsService: CashDenominationsService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Crear una denominación de efectivo del tenant',
    description:
      'Registra un valor facial (billete o moneda) que podrá usarse en los arqueos detallados por denominaciones.',
  })
  @ApiResponse({
    status: 201,
    description: 'Denominación creada exitosamente.',
    type: CashDenomination,
  })
  @ApiResponse({
    status: 409,
    description: 'Ya existe una denominación con ese valor y tipo.',
  })
  @CustomMessage('Denominación creada exitosamente')
  create(@Body() dto: CreateCashDenominationDto) {
    return this.cashDenominationsService.create(dto);
  }

  @Post('defaults')
  @ApiOperation({
    summary: 'Generar catálogo estándar CLP de denominaciones',
    description:
      'Crea de forma idempotente el catálogo estándar de billetes y monedas en pesos chilenos. Las denominaciones existentes no se modifican.',
  })
  @ApiResponse({
    status: 201,
    description: 'Catálogo estándar de denominaciones disponible.',
    type: [CashDenomination],
  })
  @CustomMessage('Catálogo de denominaciones disponible')
  seedDefaults() {
    return this.cashDenominationsService.seedDefaults();
  }

  @Get()
  @ApiOperation({
    summary: 'Listar denominaciones de efectivo del tenant',
    description:
      'Obtiene el catálogo de denominaciones ordenado por despliegue (mayor valor primero), con filtros opcionales por vigencia y tipo.',
  })
  @ApiResponse({
    status: 200,
    description: 'Denominaciones obtenidas exitosamente.',
    type: [CashDenomination],
  })
  @CustomMessage('Denominaciones obtenidas exitosamente')
  findAll(@Query() query: QueryCashDenominationsDto) {
    return this.cashDenominationsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener una denominación de efectivo' })
  @ApiParam({ name: 'id', description: 'ID UUID de la denominación' })
  @ApiResponse({
    status: 200,
    description: 'Denominación obtenida exitosamente.',
    type: CashDenomination,
  })
  @ApiResponse({ status: 404, description: 'Denominación no encontrada.' })
  @CustomMessage('Denominación obtenida exitosamente')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.cashDenominationsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Actualizar una denominación de efectivo',
    description:
      'Permite renombrar, reordenar y activar/desactivar la denominación. El valor facial y el tipo son inmutables para no alterar el catálogo histórico.',
  })
  @ApiParam({ name: 'id', description: 'ID UUID de la denominación' })
  @ApiResponse({
    status: 200,
    description: 'Denominación actualizada exitosamente.',
    type: CashDenomination,
  })
  @ApiResponse({ status: 404, description: 'Denominación no encontrada.' })
  @CustomMessage('Denominación actualizada exitosamente')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCashDenominationDto,
  ) {
    return this.cashDenominationsService.update(id, dto);
  }
}
