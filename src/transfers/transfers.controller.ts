import { Controller, Post, Body, Param, Get, Query } from '@nestjs/common';
import { TransfersService } from './transfers.service';
import { CreateStoreTransferDto } from './dto/create-store-transfer.dto';
import { AddTransferItemDto } from './dto/add-transfer-item.dto';
import { ListTransfersFilterDto } from './dto/list-transfers-filter.dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';

@ApiTags('Transferencias entre Tiendas')
@Controller('transfers')
export class TransfersController {
  constructor(private readonly transfersService: TransfersService) {}

  @Get()
  @ApiOperation({
    summary: 'Listar historial de transferencias',
    description:
      'Retorna todas las transferencias con filtros opcionales por tienda origen, destino, estado y paginación.',
  })
  @ApiQuery({ name: 'originStoreID', required: false, type: String })
  @ApiQuery({ name: 'destinationStoreID', required: false, type: String })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['PENDING', 'COMPLETED', 'CANCELLED'],
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'Listado de transferencias paginado.',
  })
  findAll(@Query() filters: ListTransfersFilterDto) {
    return this.transfersService.findAll(filters);
  }

  @Post()
  @ApiOperation({
    summary: 'Crear una nueva transferencia en borrador',
    description:
      'Inicia un proceso de transferencia entre una tienda origen y una tienda destino.',
  })
  @ApiResponse({
    status: 201,
    description: 'La transferencia ha sido creada en estado borrador.',
  })
  @ApiResponse({ status: 400, description: 'Datos de entrada inválidos.' })
  createTransfer(@Body() createDto: CreateStoreTransferDto) {
    return this.transfersService.createTransfer(createDto);
  }

  @Post(':id/items')
  @ApiOperation({
    summary: 'Agregar un producto a una transferencia pendiente',
    description:
      'Añade un item con su cantidad a una transferencia que aún no ha sido completada.',
  })
  @ApiParam({ name: 'id', description: 'ID de la transferencia (UUID)' })
  @ApiResponse({
    status: 201,
    description: 'Producto agregado exitosamente a la transferencia.',
  })
  @ApiResponse({ status: 404, description: 'Transferencia no encontrada.' })
  addItem(
    @Param('id') transferID: string,
    @Body() addItemDto: AddTransferItemDto,
  ) {
    return this.transfersService.addItem(transferID, addItemDto);
  }

  @Post(':id/complete')
  @ApiOperation({
    summary: 'Completar transferencia y mover stock',
    description:
      'Finaliza la transferencia, validando el stock en origen y realizando el movimiento físico de mercancía.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID de la transferencia a completar (UUID)',
  })
  @ApiResponse({
    status: 200,
    description:
      'Transferencia completada y stock actualizado en ambas tiendas.',
  })
  @ApiResponse({
    status: 400,
    description:
      'Error al completar la transferencia (ej. stock insuficiente).',
  })
  @ApiResponse({ status: 404, description: 'Transferencia no encontrada.' })
  completeTransfer(@Param('id') transferID: string) {
    return this.transfersService.completeTransfer(transferID);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener detalles de una transferencia' })
  @ApiParam({ name: 'id', description: 'ID de la transferencia (UUID)' })
  @ApiResponse({
    status: 200,
    description: 'Detalles de la transferencia recuperados exitosamente.',
  })
  @ApiResponse({ status: 404, description: 'Transferencia no encontrada.' })
  getTransfer(@Param('id') transferID: string) {
    return this.transfersService.getTransfer(transferID);
  }
}
