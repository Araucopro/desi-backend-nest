import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { Permission } from './entities/permission.entity';
import { Role } from './entities/role.entity';
import { RolesService } from './roles.service';

@ApiTags('Roles')
@ApiBearerAuth()
@Controller('roles')
@RequirePermission('roles:manage')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @ApiOperation({
    summary: 'Listar roles del tenant',
    description:
      'Devuelve roles personalizados y roles protegidos del tenant autenticado, incluyendo sus permisos asignados.',
  })
  @ApiResponse({ status: 200, description: 'Roles del tenant.', type: [Role] })
  @ApiForbiddenResponse({ description: 'El usuario no tiene roles:manage.' })
  findAll() {
    return this.rolesService.findAll();
  }

  @Get('permissions')
  @ApiOperation({
    summary: 'Listar catálogo global de permisos',
    description:
      'Consulta de solo lectura del catálogo fijo. Los tenants no pueden crear ni modificar permisos. El catálogo completo está documentado en docs/permissions-catalog.md.',
  })
  @ApiResponse({
    status: 200,
    description: 'Catálogo de permisos.',
    type: [Permission],
  })
  findPermissions() {
    return this.rolesService.findPermissions();
  }

  @Post()
  @ApiOperation({
    summary: 'Crear rol personalizado',
    description:
      'Crea un rol tenant-owned sin systemKey. Los roles protegidos se generan durante el provisioning.',
  })
  @ApiBody({ type: CreateRoleDto })
  @ApiResponse({ status: 201, description: 'Rol creado.', type: Role })
  @ApiConflictResponse({ description: 'Ya existe un rol con ese nombre.' })
  create(@Body() dto: CreateRoleDto) {
    return this.rolesService.create(dto);
  }

  @Patch(':id/permissions')
  @ApiOperation({
    summary: 'Reemplazar permisos de un rol',
    description:
      'Reemplaza la asignación completa. OWN solo es válido para permisos que soportan ownership.',
  })
  @ApiParam({
    name: 'id',
    format: 'uuid',
    description: 'ID del rol tenant-owned.',
  })
  @ApiBody({ type: UpdateRolePermissionsDto })
  @ApiResponse({
    status: 200,
    description: 'Permisos actualizados.',
    type: Role,
  })
  @ApiBadRequestResponse({
    description: 'Permiso inexistente, duplicado o scope OWN inválido.',
  })
  @ApiNotFoundResponse({ description: 'Rol inexistente en el tenant.' })
  @ApiForbiddenResponse({ description: 'El rol es protegido.' })
  updatePermissions(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRolePermissionsDto,
  ) {
    return this.rolesService.updatePermissions(id, dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Renombrar rol personalizado',
    description:
      'Solo permite renombrar roles tenant-owned que no sean system.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'ID del rol.' })
  @ApiBody({ type: UpdateRoleDto })
  @ApiResponse({ status: 200, description: 'Rol actualizado.', type: Role })
  @ApiForbiddenResponse({
    description: 'Los roles protegidos no pueden renombrarse.',
  })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRoleDto) {
    return this.rolesService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Eliminar rol personalizado',
    description:
      'Elimina un rol sin systemKey que no esté asignado a usuarios. Los roles protegidos nunca se eliminan.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'ID del rol.' })
  @ApiResponse({ status: 200, description: 'Rol eliminado.' })
  @ApiConflictResponse({ description: 'El rol está asignado a usuarios.' })
  @ApiForbiddenResponse({
    description: 'Los roles protegidos no pueden eliminarse.',
  })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.rolesService.remove(id);
  }
}
