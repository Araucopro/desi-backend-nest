import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags, ApiParam } from '@nestjs/swagger';
import { PurchaseOrdersService } from './purchase-orders.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { UpdatePurchaseOrderDto } from './dto/update-purchase-order.dto';
import { UpdatePurchaseOrderStatusDto } from './dto/update-purchase-order-status.dto';
import { VerifyPurchaseOrderDto } from './dto/verify-purchase-order.dto';
import { PurchaseOrder } from './entities/purchase-order.entity';

@ApiTags('Ordenes de Compra')
@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(private readonly purchaseOrdersService: PurchaseOrdersService) {}

  @Post()
  @ApiOperation({ summary: 'Crear una orden de compra' })
  @ApiResponse({
    status: 201,
    description: 'Orden de compra creada.',
    type: PurchaseOrder,
  })
  create(@Body() dto: CreatePurchaseOrderDto) {
    return this.purchaseOrdersService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar órdenes de compra' })
  @ApiResponse({
    status: 200,
    description: 'Lista de órdenes de compra.',
    type: [PurchaseOrder],
  })
  findAll() {
    return this.purchaseOrdersService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener detalle de una orden de compra' })
  @ApiParam({
    name: 'id',
    description: 'ID de la orden de compra',
    type: String,
  })
  @ApiResponse({
    status: 200,
    description: 'Detalle de la orden de compra.',
    type: PurchaseOrder,
  })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.purchaseOrdersService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar datos generales de la orden de compra' })
  @ApiParam({
    name: 'id',
    description: 'ID de la orden de compra',
    type: String,
  })
  @ApiResponse({
    status: 200,
    description: 'Orden de compra actualizada.',
    type: PurchaseOrder,
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePurchaseOrderDto,
  ) {
    return this.purchaseOrdersService.update(id, dto);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Actualizar el estado/pago de la orden de compra' })
  @ApiParam({
    name: 'id',
    description: 'ID de la orden de compra',
    type: String,
  })
  @ApiResponse({
    status: 200,
    description: 'Estado de orden de compra actualizado.',
    type: PurchaseOrder,
  })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePurchaseOrderStatusDto,
  ) {
    return this.purchaseOrdersService.updateStatus(id, dto);
  }

  @Post(':id/verify')
  @ApiOperation({
    summary: 'Verificar productos recibidos para la orden de compra',
  })
  @ApiParam({
    name: 'id',
    description: 'ID de la orden de compra',
    type: String,
  })
  @ApiResponse({
    status: 200,
    description: 'Verificación procesada exitosamente.',
  })
  verify(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VerifyPurchaseOrderDto,
  ) {
    return this.purchaseOrdersService.verify(id, dto);
  }
}
