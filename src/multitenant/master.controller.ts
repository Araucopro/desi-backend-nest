import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { MasterService } from './master.service';
import { MasterAuthGuard } from '../auth/guards/master-auth.guard';
import { MasterRoute } from '../auth/decorators/master.decorator';
import { LoginMasterDto } from './dto/login-master.dto';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { ProvisionTenantDto } from './dto/provision-tenant.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { ImpersonateTenantDto } from './dto/impersonate-tenant.dto';
import { QueryTenantsDto } from './dto/query-tenants.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { UpdateTenantStatusDto } from './dto/update-tenant-status.dto';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { UpdateUserDto } from '../users/dto/update-user.dto';
import { CreateStoreDto } from '../stores/dto/create-store.dto';
import { UpdateStoreDto } from '../stores/dto/update-store.dto';
import { Public } from '../auth/decorators/public.decorator';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';

@ApiTags('Master Platform Administration')
@Controller('master')
export class MasterController {
  constructor(private readonly service: MasterService) {}

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Iniciar sesión como usuario MASTER de plataforma' })
  @ApiResponse({
    status: 200,
    description: 'Token de acceso de plataforma de tipo master',
  })
  login(@Body() dto: LoginMasterDto) {
    return this.service.loginMaster(dto);
  }

  @Get('tenants')
  @UseGuards(MasterAuthGuard)
  @MasterRoute()
  @ApiOperation({ summary: 'Obtener lista paginada de tenants con filtros' })
  @ApiResponse({
    status: 200,
    description: 'Lista paginada de tenants incluyendo sus usuarios y tiendas',
  })
  findAll(@Query() query: QueryTenantsDto) {
    return this.service.findAllTenants(query);
  }

  @Get('tenants/:tenantId')
  @UseGuards(MasterAuthGuard)
  @MasterRoute()
  @ApiOperation({ summary: 'Obtener detalle de un tenant por su ID' })
  @ApiResponse({
    status: 200,
    description: 'Detalles del tenant incluyendo sus usuarios y tiendas',
  })
  findOne(@Param('tenantId', ParseUUIDPipe) tenantId: string) {
    return this.service.findTenantById(tenantId);
  }

  @Post('tenants')
  @UseGuards(MasterAuthGuard)
  @MasterRoute()
  @ApiOperation({ summary: 'Crear un nuevo tenant en la plataforma' })
  @ApiResponse({ status: 201, description: 'Tenant creado exitosamente' })
  create(@Body() dto: CreateTenantDto) {
    return this.service.createTenant(dto);
  }

  @Patch('tenants/:tenantId')
  @UseGuards(MasterAuthGuard)
  @MasterRoute()
  @ApiOperation({
    summary:
      'Actualizar propiedades de un tenant (maxStores, maxUsers, status, etc.)',
  })
  @ApiResponse({ status: 200, description: 'Tenant actualizado exitosamente' })
  update(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() dto: UpdateTenantDto,
    @Req() request: any,
  ) {
    return this.service.updateTenant(tenantId, dto, request.user.masterUserId);
  }

  @Post('tenants/:tenantId/provision')
  @UseGuards(MasterAuthGuard)
  @MasterRoute()
  @ApiOperation({
    summary:
      'Provisionar tienda central, usuario admin y datos base para un tenant',
  })
  @ApiResponse({ status: 201, description: 'Tenant provisionado exitosamente' })
  provision(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() dto: ProvisionTenantDto,
    @Req() request: any,
  ) {
    return this.service.provisionTenant(
      tenantId,
      dto,
      request.user.masterUserId,
    );
  }

  @Post('tenants/:tenantId/users')
  @UseGuards(MasterAuthGuard)
  @MasterRoute()
  @ApiOperation({
    summary: 'Crear un usuario dentro de un tenant',
    description:
      'Crea un usuario para el tenant indicado respetando el límite maxUsers. Solo permite tenants activos.',
  })
  @ApiParam({
    name: 'tenantId',
    description: 'ID (UUID) del tenant',
  })
  @ApiResponse({
    status: 201,
    description: 'Usuario creado exitosamente',
  })
  @ApiResponse({
    status: 403,
    description: 'Límite de usuarios del tenant excedido',
  })
  @ApiResponse({
    status: 404,
    description: 'Tenant no encontrado',
  })
  @ApiResponse({
    status: 409,
    description: 'Tenant inactivo o correo duplicado',
  })
  createUser(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() dto: CreateUserDto,
    @Req() request: any,
  ) {
    return this.service.createTenantUser(
      tenantId,
      dto,
      request.user.masterUserId,
    );
  }

  @Patch('tenants/:tenantId/users/:userId')
  @UseGuards(MasterAuthGuard)
  @MasterRoute()
  @ApiOperation({
    summary: 'Actualizar un usuario dentro de un tenant',
    description:
      'Permite editar nombre, rol, imagen o contraseña de un usuario perteneciente al tenant.',
  })
  @ApiParam({
    name: 'tenantId',
    description: 'ID (UUID) del tenant',
  })
  @ApiParam({
    name: 'userId',
    description: 'ID (UUID) del usuario a actualizar',
  })
  @ApiResponse({
    status: 200,
    description: 'Usuario actualizado exitosamente',
  })
  @ApiResponse({
    status: 404,
    description: 'Usuario no encontrado en el tenant',
  })
  updateUser(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateUserDto,
    @Req() request: any,
  ) {
    return this.service.updateTenantUser(
      tenantId,
      userId,
      dto,
      request.user.masterUserId,
    );
  }

  @Post('tenants/:tenantId/stores')
  @UseGuards(MasterAuthGuard)
  @MasterRoute()
  @ApiOperation({
    summary: 'Crear una tienda dentro de un tenant',
    description:
      'Crea una tienda para el tenant indicado respetando el límite maxStores. Solo permite tenants activos.',
  })
  @ApiParam({
    name: 'tenantId',
    description: 'ID (UUID) del tenant',
  })
  @ApiResponse({
    status: 201,
    description: 'Tienda creada exitosamente',
  })
  @ApiResponse({
    status: 403,
    description: 'Límite de tiendas del tenant excedido',
  })
  @ApiResponse({
    status: 404,
    description: 'Tenant no encontrado',
  })
  @ApiResponse({
    status: 409,
    description: 'Tenant inactivo o email/nombre de tienda duplicado',
  })
  createStore(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() dto: CreateStoreDto,
    @Req() request: any,
  ) {
    return this.service.createTenantStore(
      tenantId,
      dto,
      request.user.masterUserId,
    );
  }

  @Patch('tenants/:tenantId/stores/:storeId')
  @UseGuards(MasterAuthGuard)
  @MasterRoute()
  @ApiOperation({
    summary: 'Actualizar una tienda dentro de un tenant',
    description:
      'Permite editar la información de una tienda perteneciente al tenant.',
  })
  @ApiParam({
    name: 'tenantId',
    description: 'ID (UUID) del tenant',
  })
  @ApiParam({
    name: 'storeId',
    description: 'ID (UUID) de la tienda a actualizar',
  })
  @ApiResponse({
    status: 200,
    description: 'Tienda actualizada exitosamente',
  })
  @ApiResponse({
    status: 404,
    description: 'Tienda no encontrada en el tenant',
  })
  @ApiResponse({
    status: 409,
    description: 'Email o nombre de tienda duplicado',
  })
  updateStore(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Body() dto: UpdateStoreDto,
    @Req() request: any,
  ) {
    return this.service.updateTenantStore(
      tenantId,
      storeId,
      dto,
      request.user.masterUserId,
    );
  }

  @Get('tenants/:tenantId/metrics')
  @UseGuards(MasterAuthGuard)
  @MasterRoute()
  @ApiOperation({
    summary: 'Obtener métricas de uso y telemetría de un tenant',
  })
  metrics(@Param('tenantId', ParseUUIDPipe) tenantId: string) {
    return this.service.getTenantMetrics(tenantId);
  }

  @Patch('tenants/:tenantId/subscription')
  @UseGuards(MasterAuthGuard)
  @MasterRoute()
  @ApiOperation({
    summary: 'Actualizar tipo de plan y vencimiento de suscripción',
  })
  subscription(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() dto: UpdateSubscriptionDto,
    @Req() request: any,
  ) {
    return this.service.updateSubscription(
      tenantId,
      dto,
      request.user.masterUserId,
    );
  }

  @Get('tenants/:tenantId/export')
  @UseGuards(MasterAuthGuard)
  @MasterRoute()
  @ApiOperation({ summary: 'Exportar respaldo completo de datos de un tenant' })
  exportData(@Param('tenantId', ParseUUIDPipe) tenantId: string) {
    return this.service.exportTenantData(tenantId);
  }

  @Patch('tenants/:tenantId/status')
  @UseGuards(MasterAuthGuard)
  @MasterRoute()
  @ApiOperation({
    summary: 'Cambiar el estado de un tenant',
    description:
      'Permite a un administrador MASTER activar, suspender o archivar un tenant. El cambio queda registrado en audit_events.',
  })
  @ApiParam({
    name: 'tenantId',
    description: 'ID (UUID) del tenant cuyo estado se actualizará',
  })
  @ApiResponse({
    status: 200,
    description: 'Estado del tenant actualizado correctamente',
  })
  @ApiResponse({
    status: 404,
    description: 'Tenant no encontrado',
  })
  status(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() body: UpdateTenantStatusDto,
    @Req() request: any,
  ) {
    return this.service.setStatus(
      tenantId,
      body.status,
      request.user.masterUserId,
    );
  }

  @Post('tenants/:tenantId/impersonate')
  @UseGuards(MasterAuthGuard)
  @MasterRoute()
  @ApiOperation({
    summary: 'Generar token de impersonación de un tenant',
    description:
      'Genera un token JWT de tipo master con impersonatingTenantId para operar como soporte dentro del tenant. Solo permite tenants activos y registra la acción en audit_events.',
  })
  @ApiParam({
    name: 'tenantId',
    description: 'ID (UUID) del tenant que se desea impersonar',
  })
  @ApiResponse({
    status: 201,
    description:
      'Token JWT de impersonación generado; incluye impersonatingTenantId',
  })
  @ApiResponse({
    status: 404,
    description: 'Tenant no encontrado o no está activo',
  })
  impersonate(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() dto: ImpersonateTenantDto,
    @Req() request: any,
  ) {
    return this.service.impersonate(
      tenantId,
      request.user.masterUserId,
      dto?.reason,
    );
  }
}
