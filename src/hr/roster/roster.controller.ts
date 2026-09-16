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
import { TenantAbility } from '../../auth/ability/ability.factory';
import { PermissionScope } from '../../roles/entities/role-permission.entity';
import { GetUser } from '../../auth/decorators/get-user.decorator';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { EmployeeRosterQueryDto } from './dto/employee-roster-query.dto';
import { EmployeeSummaryDto } from './dto/employee-summary.dto';
import { RosterService } from './roster.service';

@ApiTags('Recursos Humanos')
@ApiBearerAuth('access-token')
@Controller('hr/employees')
@UseGuards(StoreContextGuard)
export class RosterController {
  constructor(private readonly rosterService: RosterService) {}

  @Get()
  @RequirePermission('hr-attendance:read')
  @ApiOperation({
    summary: 'Listar trabajadores de la tienda por fecha',
    description:
      'Devuelve los usuarios asignados a la tienda en la fecha solicitada. El roster se reconstruye con las fechas efectivas de UserStore, por lo que las bajas posteriores no alteran el histórico. Los usuarios con scope OWN reciben únicamente su propio registro.',
  })
  @ApiHeader({
    name: 'X-Store-ID',
    required: true,
    description: 'Identificador UUID de la tienda activa.',
    example: 'd2c8dca4-6c1d-43f0-8f90-5e4b6f2bd7a1',
  })
  @ApiQuery({
    name: 'date',
    required: false,
    description:
      'Fecha del roster en formato YYYY-MM-DD. Por defecto, hoy en el tenant.',
    format: 'date',
    example: '2026-09-15',
  })
  @ApiResponse({
    status: 200,
    description: 'Roster de trabajadores vigente en la fecha solicitada.',
    type: [EmployeeSummaryDto],
  })
  @ApiBadRequestResponse({ description: 'La fecha no tiene formato válido.' })
  @ApiUnauthorizedResponse({
    description: 'Token ausente, inválido o expirado.',
  })
  @ApiForbiddenResponse({
    description:
      'El usuario no tiene acceso a la tienda o carece de hr-attendance:read.',
  })
  findAll(
    @GetStoreId() storeID: string,
    @Query() query: EmployeeRosterQueryDto,
    @GetAbility() ability: TenantAbility,
    @GetUser() user: JwtPayload,
  ) {
    const employeeID =
      ability.scopeFor('hr-attendance:read') === PermissionScope.OWN
        ? user.userId
        : undefined;
    return this.rosterService.getActiveEmployees(
      storeID,
      query.date,
      employeeID,
    );
  }
}
