import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiHeader,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { GetAbility } from '../../auth/decorators/get-ability.decorator';
import { GetStoreId } from '../../common/decorators/get-store-id.decorator';
import { StoreContextGuard } from '../../common/guards/store-context.guard';
import { GetUser } from '../../auth/decorators/get-user.decorator';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { TenantAbility } from '../../auth/ability/ability.factory';
import { PermissionScope } from '../../roles/entities/role-permission.entity';
import { CalendarQueryDto } from './dto/calendar-query.dto';
import { AttendanceSummaryQueryDto } from './dto/attendance-summary-query.dto';
import {
  AttendanceCalendarResponseDto,
  AttendanceSummaryResponseDto,
} from './dto/attendance-response.dto';
import { AttendanceCalendarService } from './attendance-calendar.service';

@ApiTags('Recursos Humanos')
@ApiBearerAuth('access-token')
@Controller('hr')
@UseGuards(StoreContextGuard)
export class AttendanceCalendarController {
  constructor(private readonly service: AttendanceCalendarService) {}

  @Get('calendar')
  @RequirePermission('hr-attendance:read')
  @ApiOperation({
    summary: 'Consultar calendario mensual de asistencia',
    description:
      'Devuelve un día por cada fecha del mes solicitado y el detalle de los trabajadores que pertenecían al roster de la tienda. PRESENT es el estado por defecto en días abiertos; los días CLOSED no cuentan como ausencias. Los usuarios con scope OWN reciben únicamente su calendario.',
  })
  @ApiHeader({
    name: 'X-Store-ID',
    required: true,
    description: 'Identificador UUID de la tienda activa.',
    example: 'd2c8dca4-6c1d-43f0-8f90-5e4b6f2bd7a1',
  })
  @ApiQuery({
    name: 'month',
    required: true,
    description: 'Mes completo a consultar en formato YYYY-MM.',
    example: '2026-09',
    pattern: '^\\d{4}-(0[1-9]|1[0-2])$',
  })
  @ApiResponse({
    status: 200,
    description: 'Calendario mensual calculado.',
    type: AttendanceCalendarResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'El mes no tiene formato YYYY-MM válido.',
  })
  @ApiUnauthorizedResponse({
    description: 'Token ausente, inválido o expirado.',
  })
  @ApiForbiddenResponse({
    description: 'Falta hr-attendance:read o acceso a la tienda.',
  })
  getCalendar(
    @GetStoreId() storeID: string,
    @Query() query: CalendarQueryDto,
    @GetAbility() ability: TenantAbility,
    @GetUser() user: JwtPayload,
  ) {
    const employeeID =
      ability.scopeFor('hr-attendance:read') === PermissionScope.OWN
        ? user.userId
        : undefined;
    return this.service.getMonth(storeID, query.month, employeeID);
  }

  @Get('attendance-summary')
  @RequirePermission('hr-attendance:read')
  @ApiOperation({
    summary: 'Consultar resumen de asistencia',
    description:
      'Agrega las mismas reglas del calendario para un rango inclusivo. Los conteos de absentCount excluyen días cerrados; employeeDays representa las combinaciones trabajador-día del roster.',
  })
  @ApiHeader({
    name: 'X-Store-ID',
    required: true,
    description: 'Identificador UUID de la tienda activa.',
    example: 'd2c8dca4-6c1d-43f0-8f90-5e4b6f2bd7a1',
  })
  @ApiQuery({
    name: 'from',
    required: true,
    description: 'Primer día del rango, inclusive.',
    format: 'date',
    example: '2026-09-01',
  })
  @ApiQuery({
    name: 'to',
    required: true,
    description: 'Último día del rango, inclusive. Máximo 367 días.',
    format: 'date',
    example: '2026-09-30',
  })
  @ApiResponse({
    status: 200,
    description: 'Resumen de asistencia calculado.',
    type: AttendanceSummaryResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'El rango es inválido o supera el máximo permitido.',
  })
  @ApiUnauthorizedResponse({
    description: 'Token ausente, inválido o expirado.',
  })
  @ApiForbiddenResponse({
    description: 'Falta hr-attendance:read o acceso a la tienda.',
  })
  getSummary(
    @GetStoreId() storeID: string,
    @Query() query: AttendanceSummaryQueryDto,
    @GetAbility() ability: TenantAbility,
    @GetUser() user: JwtPayload,
  ) {
    const employeeID =
      ability.scopeFor('hr-attendance:read') === PermissionScope.OWN
        ? user.userId
        : undefined;
    return this.service.getSummary(storeID, query.from, query.to, employeeID);
  }
}
