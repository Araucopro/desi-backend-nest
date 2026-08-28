import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { UserstoresService } from './userstores.service';
import { CreateUserstoreDto } from './dto/create-userstore.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { UserStore } from './entities/userstore.entity';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { GetUser } from '../../auth/decorators/get-user.decorator';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';

@ApiTags('Usuarios de las Tiendas')
@Controller('userstores')
export class UserstoresController {
  constructor(private readonly userstoresService: UserstoresService) {}

  @Post()
  @RequirePermission('userstores:manage')
  @ApiOperation({
    summary: 'Asignar un usuario a una tienda',
    description:
      'Crea una relación entre un usuario y una tienda, permitiendo que el usuario tenga acceso a esa tienda.',
  })
  @ApiResponse({
    status: 201,
    description: 'Usuario asignado a la tienda exitosamente.',
    type: UserStore,
  })
  @ApiResponse({ status: 400, description: 'Datos inválidos.' })
  create(@Body() createUserstoreDto: CreateUserstoreDto) {
    return this.userstoresService.create(createUserstoreDto);
  }

  @Get()
  @RequirePermission('userstores:manage')
  @ApiOperation({
    summary: 'Obtener todas las relaciones usuario-tienda',
    description:
      'Retorna el listado completo de asignaciones entre usuarios y tiendas.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de relaciones usuario-tienda.',
    type: [UserStore],
  })
  findAll() {
    return this.userstoresService.findAll();
  }

  @Get('my-stores')
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: 'Obtener las tiendas del usuario autenticado',
    description:
      'Retorna todas las tiendas asignadas al usuario que realiza la petición. ' +
      'Si el usuario es admin del tenant devuelve todas las tiendas del tenant.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de tiendas accesibles por el usuario.',
    type: [UserStore],
  })
  @ApiResponse({ status: 401, description: 'No autorizado.' })
  findMyStores(@GetUser() user: JwtPayload) {
    const userId = user.userId || user.id;
    return this.userstoresService.findStoresByUserId(userId);
  }

  @Get(':id')
  @RequirePermission('userstores:manage')
  @ApiOperation({
    summary: 'Obtener tiendas de un usuario',
    description: 'Retorna todas las tiendas a las que un usuario tiene acceso.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID de la relación usuario-tienda',
    type: String,
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de tiendas del usuario.',
    type: [UserStore],
  })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado.' })
  findOne(@Param('id') id: string) {
    return this.userstoresService.findStoresByUserId(id);
  }

  @Delete(':id')
  @RequirePermission('userstores:manage')
  @ApiOperation({
    summary: 'Eliminar asignación usuario-tienda',
    description:
      'Elimina la relación entre un usuario y una tienda, revocando el acceso del usuario a esa tienda.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID de la relación usuario-tienda',
    type: String,
  })
  @ApiResponse({
    status: 200,
    description: 'Asignación eliminada exitosamente.',
  })
  @ApiResponse({ status: 404, description: 'Asignación no encontrada.' })
  remove(@Param('id') id: string) {
    return this.userstoresService.remove(id);
  }
}
