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
import { CashMovementReasonsService } from './cash-movement-reasons.service';
import { CreateCashMovementReasonDto } from './dto/create-cash-movement-reason.dto';
import { QueryCashMovementReasonsDto } from './dto/query-cash-movement-reasons.dto';
import { UpdateCashMovementReasonDto } from './dto/update-cash-movement-reason.dto';
import { CashMovementReason } from './entities/cash-movement-reason.entity';

@ApiTags('Razones de movimiento de caja')
@Controller('cash-movement-reasons')
export class CashMovementReasonsController {
  constructor(
    private readonly cashMovementReasonsService: CashMovementReasonsService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Crear una razón de movimiento de caja del tenant',
    description:
      'Registra una razón configurable (retiros, gastos, ajustes, etc.) con su sentido de movimiento y si exige aprobación de supervisor.',
  })
  @ApiResponse({
    status: 201,
    description: 'Razón de movimiento creada exitosamente.',
    type: CashMovementReason,
  })
  @ApiResponse({
    status: 409,
    description: 'Ya existe una razón con ese código en el tenant.',
  })
  @CustomMessage('Razón de movimiento creada exitosamente')
  create(@Body() dto: CreateCashMovementReasonDto) {
    return this.cashMovementReasonsService.create(dto);
  }

  @Post('defaults')
  @ApiOperation({
    summary: 'Generar catálogo estándar de razones de movimiento',
    description:
      'Crea de forma idempotente el catálogo estándar del tenant (venta, devolución, fondo inicial, retiro, caja chica, pago a proveedor, gasto, ajuste, depósito y otros). Los códigos existentes no se modifican.',
  })
  @ApiResponse({
    status: 201,
    description: 'Catálogo estándar de razones disponible.',
    type: [CashMovementReason],
  })
  @CustomMessage('Catálogo de razones de movimiento disponible')
  seedDefaults() {
    return this.cashMovementReasonsService.seedDefaults();
  }

  @Get()
  @ApiOperation({
    summary: 'Listar razones de movimiento del tenant',
    description:
      'Obtiene el catálogo de razones con filtros opcionales por estado, sentido del movimiento y exigencia de aprobación. Las razones sin sentido asignado aplican a ambos sentidos.',
  })
  @ApiResponse({
    status: 200,
    description: 'Razones de movimiento obtenidas exitosamente.',
    type: [CashMovementReason],
  })
  @CustomMessage('Razones de movimiento obtenidas exitosamente')
  findAll(@Query() query: QueryCashMovementReasonsDto) {
    return this.cashMovementReasonsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener una razón de movimiento' })
  @ApiParam({ name: 'id', description: 'ID UUID de la razón de movimiento' })
  @ApiResponse({
    status: 200,
    description: 'Razón de movimiento obtenida exitosamente.',
    type: CashMovementReason,
  })
  @ApiResponse({
    status: 404,
    description: 'Razón de movimiento no encontrada.',
  })
  @CustomMessage('Razón de movimiento obtenida exitosamente')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.cashMovementReasonsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Actualizar una razón de movimiento',
    description:
      'Permite renombrar, cambiar el sentido, activar/desactivar y exigir o levantar la aprobación de supervisor. El código es inmutable para no romper la trazabilidad de los movimientos ya registrados.',
  })
  @ApiParam({ name: 'id', description: 'ID UUID de la razón de movimiento' })
  @ApiResponse({
    status: 200,
    description: 'Razón de movimiento actualizada exitosamente.',
    type: CashMovementReason,
  })
  @ApiResponse({
    status: 404,
    description: 'Razón de movimiento no encontrada.',
  })
  @CustomMessage('Razón de movimiento actualizada exitosamente')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCashMovementReasonDto,
  ) {
    return this.cashMovementReasonsService.update(id, dto);
  }
}
