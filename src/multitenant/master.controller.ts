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
import { TenantStatus } from './entities/tenant.entity';
import { LoginMasterDto } from './dto/login-master.dto';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { ProvisionTenantDto } from './dto/provision-tenant.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { ImpersonateTenantDto } from './dto/impersonate-tenant.dto';
import { QueryTenantsDto } from './dto/query-tenants.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { Public } from '../auth/decorators/public.decorator';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

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

  @Get('tenants/:id')
  @UseGuards(MasterAuthGuard)
  @MasterRoute()
  @ApiOperation({ summary: 'Obtener detalle de un tenant por su ID' })
  @ApiResponse({
    status: 200,
    description: 'Detalles del tenant incluyendo sus usuarios y tiendas',
  })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findTenantById(id);
  }

  @Post('tenants')
  @UseGuards(MasterAuthGuard)
  @MasterRoute()
  @ApiOperation({ summary: 'Crear un nuevo tenant en la plataforma' })
  @ApiResponse({ status: 201, description: 'Tenant creado exitosamente' })
  create(@Body() dto: CreateTenantDto) {
    return this.service.createTenant(dto);
  }

  @Patch('tenants/:id')
  @UseGuards(MasterAuthGuard)
  @MasterRoute()
  @ApiOperation({
    summary:
      'Actualizar propiedades de un tenant (maxStores, maxUsers, status, etc.)',
  })
  @ApiResponse({ status: 200, description: 'Tenant actualizado exitosamente' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTenantDto,
    @Req() request: any,
  ) {
    return this.service.updateTenant(id, dto, request.user.masterUserId);
  }

  @Post('tenants/:id/provision')
  @UseGuards(MasterAuthGuard)
  @MasterRoute()
  @ApiOperation({
    summary:
      'Provisionar tienda central, usuario admin y datos base para un tenant',
  })
  @ApiResponse({ status: 201, description: 'Tenant provisionado exitosamente' })
  provision(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ProvisionTenantDto,
    @Req() request: any,
  ) {
    return this.service.provisionTenant(id, dto, request.user.masterUserId);
  }

  @Get('tenants/:id/metrics')
  @UseGuards(MasterAuthGuard)
  @MasterRoute()
  @ApiOperation({
    summary: 'Obtener métricas de uso y telemetría de un tenant',
  })
  metrics(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getTenantMetrics(id);
  }

  @Patch('tenants/:id/subscription')
  @UseGuards(MasterAuthGuard)
  @MasterRoute()
  @ApiOperation({
    summary: 'Actualizar tipo de plan y vencimiento de suscripción',
  })
  subscription(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSubscriptionDto,
    @Req() request: any,
  ) {
    return this.service.updateSubscription(id, dto, request.user.masterUserId);
  }

  @Get('tenants/:id/export')
  @UseGuards(MasterAuthGuard)
  @MasterRoute()
  @ApiOperation({ summary: 'Exportar respaldo completo de datos de un tenant' })
  exportData(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.exportTenantData(id);
  }

  @Patch('tenants/:id/status')
  @UseGuards(MasterAuthGuard)
  @MasterRoute()
  status(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { status: TenantStatus },
    @Req() request: any,
  ) {
    return this.service.setStatus(id, body.status, request.user.masterUserId);
  }

  @Post('tenants/:id/impersonate')
  @UseGuards(MasterAuthGuard)
  @MasterRoute()
  impersonate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ImpersonateTenantDto,
    @Req() request: any,
  ) {
    return this.service.impersonate(id, request.user.masterUserId, dto?.reason);
  }
}
