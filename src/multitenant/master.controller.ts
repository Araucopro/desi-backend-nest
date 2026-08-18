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

const TENANT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const MASTER_USER_ID = 'd3eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const STORE_ID = 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const USER_ID = 'c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const CATEGORY_ID = 'e4eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const PRODUCT_ID = 'f5eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

const USER_EXAMPLE = {
  userID: USER_ID,
  tenantID: TENANT_ID,
  email: 'admin@araucopro.com',
  name: 'Administrador General',
  role: 'admin',
  userImg: null,
  sessionVersion: 1,
  createdAt: '2026-08-18T12:00:00.000Z',
  updatedAt: '2026-08-18T12:00:00.000Z',
};

const STORE_EXAMPLE = {
  storeID: STORE_ID,
  tenantID: TENANT_ID,
  location: 'Mall Costanera Center, Local 120',
  rut: '77.777.777-7',
  address: 'Av. Andrés Bello 2425, Providencia',
  phone: '+56223456789',
  city: 'Santiago',
  storeImg: null,
  email: 'central@araucopro.com',
  name: 'Tienda Central',
  type: 'central',
  isCentralStore: true,
  giro: 'Comercio al por menor de vestuario',
  acteco: '471000',
  cdgSIISucur: '8345',
  businessName: 'Arauco Retail SpA',
  createdAt: '2026-08-18T12:00:00.000Z',
  updatedAt: '2026-08-18T12:00:00.000Z',
};

const TENANT_EXAMPLE = {
  tenantID: TENANT_ID,
  name: 'Arauco Retail',
  slug: 'arauco-retail',
  status: 'ACTIVE',
  maxStores: 5,
  maxUsers: 5,
  planType: 'STANDARD',
  subscriptionExpiresAt: '2027-08-18T00:00:00.000Z',
  autoRenew: true,
  timeZone: 'America/Santiago',
  locale: 'es-CL',
  createdAt: '2026-08-18T12:00:00.000Z',
  updatedAt: '2026-08-18T12:00:00.000Z',
};

const TENANT_DETAIL_EXAMPLE = {
  ...TENANT_EXAMPLE,
  users: [USER_EXAMPLE],
  stores: [STORE_EXAMPLE],
};

const CATEGORY_EXAMPLE = {
  categoryID: CATEGORY_ID,
  tenantID: TENANT_ID,
  parentID: null,
  name: 'General',
};

const PRODUCT_EXAMPLE = {
  productID: PRODUCT_ID,
  tenantID: TENANT_ID,
  image: 'https://cdn.araucopro.com/polera-basica.jpg',
  categoryID: CATEGORY_ID,
  name: 'Polera básica algodón',
  brand: 'Arauco',
  genre: 'Unisex',
  description: 'Polera de algodón peinado 100%',
  createdAt: '2026-08-18T12:00:00.000Z',
  updatedAt: '2026-08-18T12:00:00.000Z',
};

const METRICS_EXAMPLE = {
  tenantID: TENANT_ID,
  name: 'Arauco Retail',
  slug: 'arauco-retail',
  status: 'ACTIVE',
  usage: {
    storesCount: 1,
    maxStores: 5,
    storesUsagePct: 20,
    usersCount: 1,
    maxUsers: 5,
    usersUsagePct: 20,
    warningThresholdReached: false,
  },
  activity: {
    productsCount: 120,
  },
  subscription: {
    planType: 'STANDARD',
    expiresAt: '2027-08-18T00:00:00.000Z',
    daysRemaining: 365,
    autoRenew: true,
  },
};

const LOGIN_EXAMPLE = {
  masterUser: {
    masterUserID: MASTER_USER_ID,
    email: 'soporte@araucopro.com',
    role: 'SUPER_ADMIN',
  },
  accessToken:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0eXBlIjoibWFzdGVyIiwibWFzdGVyVXNlcklkIjoiZDNlZWJjOTktOWMwYi00ZWY4LWJiNmQtNmJiOWJkMzgwYTExIiwiaWF0IjoxNzUzOTAwMjI5LCJleHAiOjE3NTM5MDEwMjl9.ejemplo',
};

const PROVISION_EXAMPLE = {
  message: 'Tenant provisioned successfully',
  tenantID: TENANT_ID,
  centralStoreID: STORE_ID,
  adminUserID: USER_ID,
  status: 'ACTIVE',
};

const EXPORT_EXAMPLE = {
  exportedAt: '2026-08-18T15:30:00.000Z',
  tenant: TENANT_EXAMPLE,
  data: {
    stores: [STORE_EXAMPLE],
    users: [USER_EXAMPLE],
    categories: [CATEGORY_EXAMPLE],
    products: [PRODUCT_EXAMPLE],
  },
};

const IMPERSONATE_TOKEN_EXAMPLE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0eXBlIjoibWFzdGVyIiwiaW1wZXJzb25hdGluZ1RlbmFudElkIjoiYTBlZWJjOTktOWMwYi00ZWY4LWJiNmQtNmJiOWJkMzgwYTExIiwiaWF0IjoxNzUzOTAwMjI5LCJleHAiOjE3NTM5MDEwMjl9.ejemplo';

const responseExample = (data: unknown) => ({
  statusCode: 200,
  message: 'Operación exitosa',
  error: null,
  data,
});

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
    schema: { example: responseExample(LOGIN_EXAMPLE) },
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
    schema: {
      example: responseExample({
        items: [TENANT_DETAIL_EXAMPLE],
        total: 1,
        limit: 10,
        offset: 0,
      }),
    },
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
    schema: { example: responseExample(TENANT_DETAIL_EXAMPLE) },
  })
  findOne(@Param('tenantId', ParseUUIDPipe) tenantId: string) {
    return this.service.findTenantById(tenantId);
  }

  @Post('tenants')
  @UseGuards(MasterAuthGuard)
  @MasterRoute()
  @ApiOperation({ summary: 'Crear un nuevo tenant en la plataforma' })
  @ApiResponse({
    status: 201,
    description: 'Tenant creado exitosamente',
    schema: { example: responseExample(TENANT_EXAMPLE) },
  })
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
  @ApiResponse({
    status: 200,
    description: 'Tenant actualizado exitosamente',
    schema: { example: responseExample(TENANT_EXAMPLE) },
  })
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
  @ApiResponse({
    status: 201,
    description: 'Tenant provisionado exitosamente',
    schema: { example: responseExample(PROVISION_EXAMPLE) },
  })
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
    schema: { example: responseExample(USER_EXAMPLE) },
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
    schema: { example: responseExample(USER_EXAMPLE) },
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
    schema: { example: responseExample(STORE_EXAMPLE) },
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
    schema: { example: responseExample(STORE_EXAMPLE) },
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
  @ApiResponse({
    status: 200,
    description: 'Métricas de uso y suscripción del tenant',
    schema: { example: responseExample(METRICS_EXAMPLE) },
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
  @ApiResponse({
    status: 200,
    description: 'Suscripción del tenant actualizada',
    schema: { example: responseExample(TENANT_EXAMPLE) },
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
  @ApiResponse({
    status: 200,
    description: 'Respaldo completo de los datos del tenant',
    schema: { example: responseExample(EXPORT_EXAMPLE) },
  })
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
    schema: { example: responseExample(TENANT_EXAMPLE) },
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
    schema: { example: responseExample(IMPERSONATE_TOKEN_EXAMPLE) },
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
