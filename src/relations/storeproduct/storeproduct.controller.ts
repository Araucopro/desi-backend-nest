import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { StoreProductService } from './storeproduct.service';
import { TransferStockDto } from './dto/transfer-stock.dto';
import { UpdateStoreProductDto } from './dto/update-store-product.dto';
import {
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { StoreProduct } from './entities/storeproduct.entity';
import { Product } from '../../products/entities/product.entity';

@ApiTags('Productos de la Tienda')
@Controller('storeproduct')
export class StoreProductController {
  constructor(private readonly storeProductService: StoreProductService) {}

  @Post('transfer')
  @ApiOperation({
    summary: 'Transferir stock de la central a una tienda',
    description:
      'Realiza una transferencia gratuita de productos desde el stock central hacia una tienda específica. Útil para movimientos internos sin transacción comercial.',
  })
  @ApiResponse({
    status: 201,
    description: 'Transferencia realizada exitosamente.',
  })
  @ApiResponse({
    status: 400,
    description: 'Stock insuficiente o datos inválidos.',
  })
  @ApiResponse({ status: 404, description: 'Tienda o Producto no encontrado.' })
  transferStock(@Body() transferStockDto: TransferStockDto) {
    return this.storeProductService.transferStock(transferStockDto);
  }

  @Get('inventory')
  @ApiOperation({
    summary: 'Consultar inventario de una tienda',
    description:
      'Obtiene el listado completo de productos en stock de una tienda específica, incluyendo cantidades, costos de compra y precios de venta.',
  })
  @ApiQuery({
    name: 'storeID',
    description: 'ID de la tienda para consultar inventario',
    type: String,
  })
  @ApiResponse({
    status: 200,
    description: 'Inventario de la tienda.',
    type: [Product],
  })
  getStoreInventory(@Query('storeID', ParseUUIDPipe) storeID: string) {
    return this.storeProductService.getStoreInventory(storeID);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Actualizar un producto en tienda (Inventario/Precios)',
    description:
      'Permite actualizar el stock, precio de costo y precio de venta de un producto en una tienda específica usando su StoreProductID.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID del StoreProduct a actualizar',
    type: String,
  })
  @ApiResponse({
    status: 200,
    description: 'Producto de tienda actualizado exitosamente.',
    type: StoreProduct,
  })
  @ApiResponse({
    status: 404,
    description: 'Producto de tienda no encontrado.',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateStoreProductDto: UpdateStoreProductDto,
  ) {
    return this.storeProductService.update(id, updateStoreProductDto);
  }
}
