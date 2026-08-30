import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  HttpCode,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserListQueryDto } from './dto/user-list.query.dto';
import { UserListResponseDto } from './dto/user-list-response.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { Store } from '../stores/entities/store.entity';
import { CustomMessage } from '../common/decorators/response-message';
import { User } from './entities/user.entity';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';

@ApiTags('Usuarios')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

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
