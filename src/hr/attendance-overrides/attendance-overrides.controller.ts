import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { GetStoreId } from '../../common/decorators/get-store-id.decorator';
import { StoreContextGuard } from '../../common/guards/store-context.guard';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { GetUser } from '../../auth/decorators/get-user.decorator';
import { AttendanceOverride } from './entities/attendance-override.entity';
import { AttendanceOverrideAuditLog } from './entities/attendance-override-audit-log.entity';
import { AttendanceOverridesService } from './attendance-overrides.service';
import { CreateAttendanceOverrideDto } from './dto/create-attendance-override.dto';
import { UpdateAttendanceOverrideDto } from './dto/update-attendance-override.dto';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';

@ApiTags('Recursos Humanos')
@ApiBearerAuth('access-token')
@Controller('hr/attendance-overrides')
@UseGuards(StoreContextGuard)
export class AttendanceOverridesController {
  constructor(private readonly service: AttendanceOverridesService) {}

  @Post()
  @RequirePermission('hr-attendance:manage')
  @ApiOperation({
    summary: 'Registrar una ausencia o asistencia excepcional',
    description:
      'Registra un override inclusivo para un trabajador asignado a la tienda durante todo el rango. No se permiten rangos solapados para el mismo trabajador y tienda. Los overrides también pueden registrarse en días cerrados.',
  })
  @ApiHeader({
    name: 'X-Store-ID',
    required: true,
    description: 'Identificador UUID de la tienda activa.',
    example: 'd2c8dca4-6c1d-43f0-8f90-5e4b6f2bd7a1',
  })
  @ApiBody({ type: CreateAttendanceOverrideDto })
  @ApiResponse({
    status: 201,
    description: 'Override creado y auditado.',
    type: AttendanceOverride,
  })
  @ApiBadRequestResponse({
    description: 'Fechas inválidas o el trabajador no cubre el rango.',
  })
  @ApiConflictResponse({
    description: 'El rango se solapa con otro override del trabajador.',
  })
  @ApiForbiddenResponse({
    description: 'Falta hr-attendance:manage o acceso a la tienda.',
  })
  @ApiUnauthorizedResponse({
    description: 'Token ausente, inválido o expirado.',
  })
  @ApiNotFoundResponse({ description: 'El trabajador o la tienda no existe.' })
  create(
    @GetStoreId() storeID: string,
    @Body() dto: CreateAttendanceOverrideDto,
    @GetUser() user: { userId?: string; masterUserId?: string },
  ) {
    return this.service.create(storeID, dto, {
      userID: user.userId,
      masterUserID: user.masterUserId,
    });
  }

  @Patch(':id')
  @RequirePermission('hr-attendance:manage')
  @ApiOperation({
    summary: 'Actualizar una ausencia o asistencia excepcional',
    description:
      'Actualiza parcialmente las fechas, tipo o motivo. El empleado no puede cambiarse. La operación genera una entrada UPDATED en la auditoría.',
  })
  @ApiHeader({
    name: 'X-Store-ID',
    required: true,
    description: 'Identificador UUID de la tienda activa.',
    example: 'd2c8dca4-6c1d-43f0-8f90-5e4b6f2bd7a1',
  })
  @ApiParam({
    name: 'id',
    description: 'Identificador UUID del override.',
    format: 'uuid',
    example: '4c3cc3c0-a44b-42f7-90b2-bb991ef2d9cc',
  })
  @ApiBody({ type: UpdateAttendanceOverrideDto })
  @ApiResponse({
    status: 200,
    description: 'Override actualizado y auditado.',
    type: AttendanceOverride,
  })
  @ApiBadRequestResponse({
    description: 'Fechas inválidas o el trabajador no cubre el rango.',
  })
  @ApiConflictResponse({
    description: 'El nuevo rango se solapa con otro override.',
  })
  @ApiForbiddenResponse({
    description: 'Falta hr-attendance:manage o acceso a la tienda.',
  })
  @ApiUnauthorizedResponse({
    description: 'Token ausente, inválido o expirado.',
  })
  @ApiNotFoundResponse({ description: 'El override no existe.' })
  update(
    @GetStoreId() storeID: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAttendanceOverrideDto,
    @GetUser() user: { userId?: string; masterUserId?: string },
  ) {
    return this.service.update(storeID, id, dto, {
      userID: user.userId,
      masterUserID: user.masterUserId,
    });
  }

  @Delete(':id')
  @RequirePermission('hr-attendance:manage')
  @ApiOperation({
    summary: 'Eliminar una ausencia y restaurar presencia',
    description:
      'Elimina el override, restaura el estado PRESENT por defecto y conserva una entrada DELETED en la auditoría.',
  })
  @ApiHeader({
    name: 'X-Store-ID',
    required: true,
    description: 'Identificador UUID de la tienda activa.',
    example: 'd2c8dca4-6c1d-43f0-8f90-5e4b6f2bd7a1',
  })
  @ApiParam({
    name: 'id',
    description: 'Identificador UUID del override.',
    format: 'uuid',
    example: '4c3cc3c0-a44b-42f7-90b2-bb991ef2d9cc',
  })
  @ApiResponse({ status: 200, description: 'Override eliminado y auditado.' })
  @ApiForbiddenResponse({
    description: 'Falta hr-attendance:manage o acceso a la tienda.',
  })
  @ApiUnauthorizedResponse({
    description: 'Token ausente, inválido o expirado.',
  })
  @ApiNotFoundResponse({ description: 'El override no existe.' })
  remove(
    @GetStoreId() storeID: string,
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser() user: { userId?: string; masterUserId?: string },
  ) {
    return this.service.remove(storeID, id, {
      userID: user.userId,
      masterUserID: user.masterUserId,
    });
  }
}

@ApiTags('Recursos Humanos')
@ApiBearerAuth('access-token')
@Controller('hr/attendance-audit-log')
@UseGuards(StoreContextGuard)
export class AttendanceAuditLogController {
  constructor(private readonly service: AttendanceOverridesService) {}

  @Get()
  @RequirePermission('hr-attendance:manage')
  @ApiOperation({
    summary: 'Consultar auditoría de asistencia',
    description:
      'Devuelve eventos CREATED, UPDATED y DELETED de overrides, paginados y filtrables por trabajador y rango afectado. La auditoría permanece aunque el override haya sido eliminado.',
  })
  @ApiHeader({
    name: 'X-Store-ID',
    required: true,
    description: 'Identificador UUID de la tienda activa.',
    example: 'd2c8dca4-6c1d-43f0-8f90-5e4b6f2bd7a1',
  })
  @ApiQuery({
    name: 'employeeID',
    required: false,
    format: 'uuid',
    description: 'Filtra por trabajador.',
  })
  @ApiQuery({
    name: 'from',
    required: false,
    format: 'date',
    description: 'Rango afectado desde esta fecha.',
  })
  @ApiQuery({
    name: 'to',
    required: false,
    format: 'date',
    description: 'Rango afectado hasta esta fecha.',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 50 })
  @ApiQuery({ name: 'offset', required: false, type: Number, example: 0 })
  @ApiResponse({
    status: 200,
    description: 'Eventos de auditoría encontrados.',
    type: [AttendanceOverrideAuditLog],
  })
  @ApiBadRequestResponse({
    description: 'Filtros de fecha o paginación inválidos.',
  })
  @ApiForbiddenResponse({
    description: 'Falta hr-attendance:manage o acceso a la tienda.',
  })
  @ApiUnauthorizedResponse({
    description: 'Token ausente, inválido o expirado.',
  })
  findAudit(@GetStoreId() storeID: string, @Query() query: AuditLogQueryDto) {
    return this.service.findAudit(storeID, query);
  }
}
