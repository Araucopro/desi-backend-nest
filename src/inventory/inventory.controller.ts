import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { CreateInventoryMovementDto } from './dto/create-inventory-movement.dto';
import { StoreInventoryItemDto } from './dto/store-inventory-response.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';

@ApiTags('Inventario')
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post('movements')
  @ApiOperation({
    summary: 'Crear un movimiento de inventario manual',
    description:
      'Registra una entrada o salida manual de stock para un producto específico en una tienda.',
  })
  @ApiResponse({
    status: 201,
    description: 'El movimiento de inventario ha sido registrado exitosamente.',
  })
  @ApiResponse({
    status: 400,
    description: 'Datos de entrada inválidos o stock insuficiente.',
  })
  createMovement(
    @Body() createInventoryMovementDto: CreateInventoryMovementDto,
  ) {
    return this.inventoryService.createMovement(createInventoryMovementDto);
  }

  @Get('store/:storeID')
  @ApiOperation({
    summary: 'Obtener el stock de una tienda específica',
    description:
      'Devuelve la lista de productos y sus cantidades actuales para la tienda solicitada. Deprecado: usa GET /storeproduct/inventory?storeID=..., que además incluye precios calculados y ofertas activas.',
    deprecated: true,
  })
  @ApiParam({ name: 'storeID', description: 'ID de la tienda (UUID)' })
  @ApiResponse({
    status: 200,
    description: 'Lista de inventario recuperada exitosamente.',
    type: [StoreInventoryItemDto],
  })
  @ApiResponse({ status: 404, description: 'Tienda no encontrada.' })
  getStoreStock(@Param('storeID') storeID: string) {
    return this.inventoryService.getStoreStock(storeID);
  }
}
