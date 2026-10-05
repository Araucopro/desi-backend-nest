import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Patch,
  Param,
  Delete,
  HttpCode,
  HttpStatus,
  Query,
  ForbiddenException,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserListQueryDto } from './dto/user-list.query.dto';
import { UserListResponseDto } from './dto/user-list-response.dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { Store } from '../stores/entities/store.entity';
import { CustomMessage } from '../common/decorators/response-message';
import { User } from './entities/user.entity';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import type {
  JwtPayload,
  MasterJwtPayload,
} from '../auth/interfaces/jwt-payload.interface';
import { InventoryColumnPreferencesService } from './inventory-column-preferences.service';
import { InventoryColumnPreferenceQueryDto } from './dto/inventory-column-preference-query.dto';
import { UpdateInventoryColumnPreferenceDto } from './dto/update-inventory-column-preference.dto';
import { InventoryColumnPreferenceResponseDto } from './dto/inventory-column-preference-response.dto';
import { InventoryColumnStoreFilter } from './entities/inventory-column-preference.entity';

@ApiTags('Usuarios')
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly inventoryColumnPreferences: InventoryColumnPreferencesService,
  ) {}

  @Get('me/preferences/inventory-columns')
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: 'Obtener preferencias de columnas ocultas del inventario',
    description:
      'Lee la preferencia del usuario autenticado para una tienda o filtro agregado. Debe enviarse exactamente uno de storeID o storeFilter. storeFilter solo está disponible para usuarios con rol TENANT_ADMIN. Las claves son identificadores de interfaz y no afectan los permisos ni los datos que devuelve la API.',
  })
  @ApiQuery({
    name: 'storeID',
    required: false,
    type: String,
    format: 'uuid',
    description: 'Tienda asignada al usuario o accesible por su rol.',
  })
  @ApiQuery({
    name: 'storeFilter',
    required: false,
    enum: InventoryColumnStoreFilter,
    description: 'Filtro de vista agregada, exclusivo de TENANT_ADMIN.',
  })
  @ApiResponse({
    status: 200,
    description:
      'Preferencia encontrada, o exists=false si aún no se ha guardado para este contexto.',
    type: InventoryColumnPreferenceResponseDto,
    schema: {
      example: {
        exists: true,
        hiddenColumns: ['supplierSku', 'ean'],
        updatedAt: '2026-10-02T15:30:00.000Z',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Query inválida o contexto ambiguo.',
  })
  @ApiResponse({
    status: 401,
    description: 'Token ausente, inválido o expirado.',
  })
  @ApiResponse({ status: 403, description: 'Sin acceso a la tienda o filtro.' })
  getInventoryColumnPreference(
    @GetUser() authenticatedUser: JwtPayload | MasterJwtPayload,
    @Query() query: InventoryColumnPreferenceQueryDto,
  ) {
    const { tenantID, userID } = this.getTenantIdentity(authenticatedUser);
    return this.inventoryColumnPreferences.getPreference(
      tenantID,
      userID,
      query,
    );
  }

  @Put('me/preferences/inventory-columns')
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: 'Reemplazar preferencias de columnas ocultas del inventario',
    description:
      'Reemplaza la lista completa para el contexto indicado; la última escritura prevalece. hiddenColumns puede estar vacía (la preferencia seguirá existiendo y todas las columnas quedarán visibles). Se eliminan duplicados y no se limita el conjunto de claves a un catálogo del backend. Esta preferencia solo afecta la presentación.',
  })
  @ApiQuery({
    name: 'storeID',
    required: false,
    type: String,
    format: 'uuid',
    description: 'Tienda asignada al usuario o accesible por su rol.',
  })
  @ApiQuery({
    name: 'storeFilter',
    required: false,
    enum: InventoryColumnStoreFilter,
    description: 'Filtro de vista agregada, exclusivo de TENANT_ADMIN.',
  })
  @ApiResponse({
    status: 200,
    description: 'Preferencia reemplazada correctamente.',
    type: InventoryColumnPreferenceResponseDto,
    schema: {
      example: {
        exists: true,
        hiddenColumns: ['supplierSku', 'ean'],
        updatedAt: '2026-10-02T15:30:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Query o body inválido.' })
  @ApiResponse({
    status: 401,
    description: 'Token ausente, inválido o expirado.',
  })
  @ApiResponse({ status: 403, description: 'Sin acceso a la tienda o filtro.' })
  replaceInventoryColumnPreference(
    @GetUser() authenticatedUser: JwtPayload | MasterJwtPayload,
    @Query() query: InventoryColumnPreferenceQueryDto,
    @Body() dto: UpdateInventoryColumnPreferenceDto,
  ) {
    const { tenantID, userID } = this.getTenantIdentity(authenticatedUser);
    return this.inventoryColumnPreferences.replacePreference(
      tenantID,
      userID,
      query,
      dto.hiddenColumns,
    );
  }

  private getTenantIdentity(authenticatedUser: JwtPayload | MasterJwtPayload): {
    tenantID: string;
    userID: string;
  } {
    if (
      authenticatedUser.type !== 'tenant' ||
      'masterUserId' in authenticatedUser ||
      !authenticatedUser.tenantId ||
      !authenticatedUser.userId
    ) {
      throw new ForbiddenException(
        'A tenant user identity is required for this preference',
      );
    }
    return {
      tenantID: authenticatedUser.tenantId,
      userID: authenticatedUser.userId,
    };
  }

  @Post()
  @RequirePermission('users:manage')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear un nuevo usuario' })
  @ApiResponse({
    status: 201,
    description: 'El usuario ha sido creado exitosamente.',
    type: User,
  })
  @ApiResponse({ status: 400, description: 'Solicitud incorrecta.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Get()
  @RequirePermission('users:manage')
  @CustomMessage('Lista de usuarios obtenida exitosamente')
  @ApiOperation({
    summary: 'Obtener usuarios con paginación, búsqueda y filtros',
    description:
      'Filtra por nombre/correo (search), rol y estado, con paginación limit/offset y meta con el total.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista paginada de usuarios.',
    type: UserListResponseDto,
  })
  findAll(@Query() query: UserListQueryDto) {
    return this.usersService.findAll(query);
  }

  @Get(':id/stores')
  @RequirePermission('users:manage')
  @ApiOperation({ summary: 'Obtener todas las tiendas de un usuario' })
  @ApiParam({
    name: 'id',
    description: 'ID del usuario',
    type: String,
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de tiendas del usuario.',
    type: [Store],
  })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado.' })
  findStoresByUserId(@Param('id') id: string) {
    return this.usersService.findStoresByUserId(id);
  }

  @Get(':email')
  @RequirePermission('users:manage')
  @CustomMessage('Usuario encontrado exitosamente')
  @ApiOperation({ summary: 'Buscar un usuario por su email' })
  @ApiParam({
    name: 'email',
    description: 'Email del usuario a buscar',
    type: String,
  })
  @ApiResponse({ status: 200, description: 'Usuario encontrado.', type: User })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado.' })
  findOne(@Param('email') email: string) {
    return this.usersService.findOneByEmail(email);
  }

  @Patch(':id')
  @RequirePermission('users:manage')
  @ApiOperation({ summary: 'Actualizar un usuario por su ID' })
  @ApiParam({
    name: 'id',
    description: 'ID del usuario a actualizar',
    type: String,
  })
  @ApiResponse({
    status: 200,
    description: 'El usuario ha sido actualizado exitosamente.',
    type: User,
  })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado.' })
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  @RequirePermission('users:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar un usuario por su ID' })
  @ApiParam({
    name: 'id',
    description: 'ID del usuario a eliminar',
    type: String,
  })
  @ApiResponse({
    status: 204,
    description: 'El usuario ha sido eliminado exitosamente.',
  })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado.' })
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}
