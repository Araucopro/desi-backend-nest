import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { CashRegistersService } from './cash-registers.service';
import { CreateCashRegisterDto } from './dto/create-cash-register.dto';
import { UpdateCashRegisterDto } from './dto/update-cash-register.dto';
import { OpenCashSessionDto } from './dto/open-cash-session.dto';
import { CloseCashSessionDto } from './dto/close-cash-session.dto';
import { QueryCashRegistersDto } from './dto/query-cash-registers.dto';
import { QueryCashSessionsDto } from './dto/query-cash-sessions.dto';
import { CashRegister } from './entities/cash-register.entity';
import { CashRegisterSession } from './entities/cash-register-session.entity';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { CustomMessage } from '../common/decorators/response-message';
import {
  JwtPayload,
  MasterJwtPayload,
} from '../auth/interfaces/jwt-payload.interface';

@ApiTags('Cajas')
@Controller('cash-registers')
export class CashRegistersController {
  constructor(private readonly cashRegistersService: CashRegistersService) {}

  @Post()
  @ApiOperation({
    summary: 'Crear una caja física o virtual en una tienda',
    description:
      'Registra un recurso permanente de caja asignado a una tienda dentro del tenant.',
  })
  @ApiResponse({
    status: 201,
    description: 'Caja creada exitosamente.',
    type: CashRegister,
  })
  @ApiResponse({
    status: 409,
    description: 'Ya existe una caja con ese código en la tienda.',
  })
  @CustomMessage('Caja creada exitosamente')
  create(@Body() dto: CreateCashRegisterDto) {
    return this.cashRegistersService.create(dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Listar cajas del tenant',
    description:
      'Obtiene las cajas registradas con filtro opcional por tienda o estado.',
  })
  @ApiResponse({
    status: 200,
    description: 'Listado de cajas obtenido exitosamente.',
    type: [CashRegister],
  })
  @CustomMessage('Cajas obtenidas exitosamente')
  findAll(@Query() query: QueryCashRegistersDto) {
    return this.cashRegistersService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Obtener detalle de una caja',
  })
  @ApiParam({ name: 'id', description: 'ID UUID de la caja' })
  @ApiResponse({
    status: 200,
    description: 'Detalle de la caja obtenido exitosamente.',
    type: CashRegister,
  })
  @ApiResponse({ status: 404, description: 'Caja no encontrada.' })
  @CustomMessage('Caja obtenida exitosamente')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.cashRegistersService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Actualizar configuración o estado de una caja',
  })
  @ApiParam({ name: 'id', description: 'ID UUID de la caja' })
  @ApiResponse({
    status: 200,
    description: 'Caja actualizada exitosamente.',
    type: CashRegister,
  })
  @ApiResponse({ status: 404, description: 'Caja no encontrada.' })
  @CustomMessage('Caja actualizada exitosamente')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCashRegisterDto,
  ) {
    return this.cashRegistersService.update(id, dto);
  }

  @Post(':id/sessions/open')
  @ApiOperation({
    summary: 'Abrir sesión operativa de caja (Apertura de Turno)',
    description:
      'Inicia una nueva sesión operativa con fecha contable y fondo inicial. Solo se permite una sesión abierta simultáneamente por caja.',
  })
  @ApiParam({ name: 'id', description: 'ID UUID de la caja' })
  @ApiResponse({
    status: 201,
    description: 'Sesión de caja abierta exitosamente.',
    type: CashRegisterSession,
  })
  @ApiResponse({
    status: 409,
    description: 'La caja ya cuenta con una sesión abierta activa.',
  })
  @CustomMessage('Sesión de caja abierta exitosamente')
  openSession(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: OpenCashSessionDto,
    @GetUser() user: JwtPayload | MasterJwtPayload,
  ) {
    return this.cashRegistersService.openSession(id, dto, user);
  }

  @Get(':id/sessions/active')
  @ApiOperation({
    summary: 'Obtener la sesión activa actual de la caja',
  })
  @ApiParam({ name: 'id', description: 'ID UUID de la caja' })
  @ApiResponse({
    status: 200,
    description: 'Sesión activa obtenida.',
    type: CashRegisterSession,
  })
  @ApiResponse({ status: 404, description: 'No hay sesión activa.' })
  @CustomMessage('Sesión activa obtenida exitosamente')
  getActiveSession(@Param('id', ParseUUIDPipe) id: string) {
    return this.cashRegistersService.getActiveSession(id);
  }

  @Post(':id/sessions/close')
  @ApiOperation({
    summary: 'Cerrar sesión operativa de caja (Arqueo y Cierre de Turno)',
    description:
      'Sella la sesión activa actual, computa el balance esperado vs contado, registra la diferencia y bloquea la sesión permanentemente.',
  })
  @ApiParam({ name: 'id', description: 'ID UUID de la caja' })
  @ApiResponse({
    status: 200,
    description: 'Sesión cerrada exitosamente.',
    type: CashRegisterSession,
  })
  @ApiResponse({
    status: 404,
    description: 'No hay sesión abierta para cerrar.',
  })
  @CustomMessage('Sesión de caja cerrada exitosamente')
  closeSession(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CloseCashSessionDto,
    @GetUser() user: JwtPayload | MasterJwtPayload,
  ) {
    return this.cashRegistersService.closeSession(id, dto, user);
  }

  @Get(':id/sessions')
  @ApiOperation({
    summary: 'Historial de sesiones de una caja',
  })
  @ApiParam({ name: 'id', description: 'ID UUID de la caja' })
  @ApiResponse({
    status: 200,
    description: 'Historial de sesiones obtenido exitosamente.',
    type: [CashRegisterSession],
  })
  @CustomMessage('Sesiones obtenidas exitosamente')
  findSessions(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: QueryCashSessionsDto,
  ) {
    return this.cashRegistersService.findSessions(id, query);
  }
}
