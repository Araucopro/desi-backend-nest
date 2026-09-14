import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CustomMessage } from '../common/decorators/response-message';
import { ClientsService } from './clients.service';
import { ClientDto, ClientListResponseDto } from './dto/client-response.dto';
import { CreateClientDto } from './dto/create-client.dto';
import { ListClientsQueryDto } from './dto/list-clients.query.dto';
import { UpdateClientDto } from './dto/update-client.dto';

@ApiTags('Clientes')
@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Post()
  @RequirePermission('clients:manage')
  @ApiOperation({
    summary: 'Crear un nuevo cliente',
    description: 'Registra un nuevo cliente en la base de datos del tenant.',
  })
  @ApiResponse({
    status: 201,
    description: 'Cliente creado exitosamente.',
    type: ClientDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Datos inválidos o RUT con formato incorrecto.',
  })
  @ApiResponse({
    status: 409,
    description: 'Ya existe un cliente con ese RUT en el tenant.',
  })
  @CustomMessage('Cliente creado exitosamente')
  create(@Body() createClientDto: CreateClientDto) {
    return this.clientsService.create(createClientDto);
  }

  @Get()
  @RequirePermission('clients:read')
  @ApiOperation({
    summary: 'Obtener todos los clientes',
    description:
      'Retorna el listado de clientes paginado con soporte para filtros por término de búsqueda y segmento.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de clientes.',
    type: ClientListResponseDto,
  })
  findAll(@Query() query: ListClientsQueryDto) {
    return this.clientsService.findAll(query);
  }

  @Get(':id')
  @RequirePermission('clients:read')
  @ApiOperation({
    summary: 'Obtener un cliente por ID',
    description: 'Retorna la información detallada de un cliente específico.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID del cliente',
    type: String,
  })
  @ApiResponse({
    status: 200,
    description: 'Cliente encontrado.',
    type: ClientDto,
  })
  @ApiResponse({ status: 404, description: 'Cliente no encontrado.' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.clientsService.findOne(id);
  }

  @Patch(':id')
  @RequirePermission('clients:manage')
  @ApiOperation({
    summary: 'Actualizar información de un cliente',
    description:
      'Modifica los datos de un cliente existente (nombre, dirección, segmento, notas, etc.).',
  })
  @ApiParam({
    name: 'id',
    description: 'ID del cliente',
    type: String,
  })
  @ApiResponse({
    status: 200,
    description: 'Cliente actualizado exitosamente.',
    type: ClientDto,
  })
  @ApiResponse({ status: 404, description: 'Cliente no encontrado.' })
  @ApiResponse({ status: 409, description: 'RUT duplicado.' })
  @CustomMessage('Cliente actualizado exitosamente')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateClientDto: UpdateClientDto,
  ) {
    return this.clientsService.update(id, updateClientDto);
  }

  @Delete(':id')
  @RequirePermission('clients:manage')
  @ApiOperation({
    summary: 'Eliminar un cliente',
    description:
      'Elimina permanentemente un cliente del sistema. Las ventas históricas conservan su snapshot y el clientID pasa a NULL.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID del cliente',
    type: String,
  })
  @ApiResponse({
    status: 200,
    description: 'Cliente eliminado exitosamente.',
  })
  @ApiResponse({ status: 404, description: 'Cliente no encontrado.' })
  @CustomMessage('Cliente eliminado exitosamente')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.clientsService.remove(id);
  }
}
