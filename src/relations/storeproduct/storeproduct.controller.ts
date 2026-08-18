import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { StoreProductService } from './storeproduct.service';
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
  @ApiQuery({
    name: 'search',
    required: false,
    description:
      'Búsqueda parcial (sin distinguir mayúsculas) por nombre/marca/categoría del producto o SKU, supplierSku o código de barras de la variante',
  })
  @ApiQuery({
    name: 'barcode',
    required: false,
    description:
      'Código de barras exacto de la variante (EAN/UPC) para escaneo',
    example: '7801234567890',
  })
  @ApiResponse({
    status: 200,
    description: 'Inventario de la tienda.',
    type: [Product],
  })
  getStoreInventory(
    @Query('storeID', ParseUUIDPipe) storeID: string,
    @Query('search') search?: string,
    @Query('barcode') barcode?: string,
  ) {
    return this.storeProductService.getStoreInventory(storeID, search, barcode);
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
