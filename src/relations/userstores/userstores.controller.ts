import { Controller, Get, Post, Body, Param, Delete } from '@nestjs/common';
import { UserstoresService } from './userstores.service';
import { CreateUserstoreDto } from './dto/create-userstore.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { UserStore } from './entities/userstore.entity';

@ApiTags('Usuarios de las Tiendas')
@Controller('userstores')
export class UserstoresController {
  constructor(private readonly userstoresService: UserstoresService) {}

  @Post()
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

  @Get(':id')
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
