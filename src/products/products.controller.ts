import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateProductsBulkDto } from './dto/create-products-bulk.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductListQueryDto } from './dto/product-list.query.dto';
import { ProductListResponseDto } from './dto/product-list-response.dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { Product } from './entities/product.entity';

@ApiTags('Productos')
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @ApiOperation({ summary: 'Crear un nuevo producto con sus variantes' })
  @ApiResponse({
    status: 201,
    description: 'El producto ha sido creado exitosamente.',
    type: Product,
  })
  create(@Body() createProductDto: CreateProductDto) {
    return this.productsService.create(createProductDto);
  }

  @Post('bulk')
  @ApiOperation({
    summary: 'Crear o actualizar productos masivamente con sus variantes',
    description:
      'Recibe un arreglo de productos con sus variantes. Cada producto se resuelve por nombre (ignorando mayúsculas/minúsculas y espacios): ' +
      'si ya existe se actualiza y se sincronizan sus variantes por SKU; si no existe, se crea. ' +
      'La categoría se resuelve por nombre y, si no existe, se crea automáticamente como categoría raíz. ' +
      'Todo se procesa en una sola transacción: ante cualquier conflicto (nombres o SKUs duplicados, SKU perteneciente a otro producto) el lote se revierte por completo. ' +
      'Máximo 100 productos por llamada.',
  })
  @ApiBody({
    type: CreateProductsBulkDto,
    examples: {
      'Crear y actualizar': {
        summary: 'Productos con variantes y categoría por nombre',
        value: {
          items: [
            {
              name: 'Camiseta Básica',
              categoryName: 'Vestuario',
              brand: 'Marca Famosa',
              genre: 'Unisex',
              variations: [
                {
                  sku: 'CAM-BAS-L',
                  priceCost: 8000,
                  priceList: 15000,
                  stock: 50,
                  color: 'Blanco',
                  size: 'L',
                },
              ],
            },
            {
              name: 'Polera Deportiva',
              categoryName: 'Vestuario',
              variations: [
                {
                  sku: 'POL-DEP-M',
                  priceCost: 12000,
                  priceList: 22000,
                  stock: 30,
                  color: 'Azul',
                  size: 'M',
                },
              ],
            },
          ],
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description:
      'Productos creados y/o actualizados, en el mismo orden del arreglo recibido, con sus variantes y categoría.',
    type: [Product],
  })
  @ApiResponse({
    status: 400,
    description:
      'Validación fallida, duplicados en el lote o SKU que ya pertenece a otro producto.',
  })
  bulkUpsert(@Body() createProductsBulkDto: CreateProductsBulkDto) {
    return this.productsService.bulkUpsert(createProductsBulkDto);
  }

  @Get()
  @ApiOperation({
    summary: 'Obtener productos con paginación y búsqueda',
    description:
      'Filtra por nombre, marca, categoría, SKU, supplierSku o código de barras de las variantes.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de productos.',
    type: ProductListResponseDto,
  })
  findAll(@Query() query: ProductListQueryDto) {
    return this.productsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar un producto por su ID' })
  @ApiParam({
    name: 'id',
    description: 'ID único del producto',
    type: String,
  })
  @ApiResponse({
    status: 200,
    description: 'Producto encontrado.',
    type: Product,
  })
  @ApiResponse({ status: 404, description: 'Producto no encontrado.' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.productsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar un producto por su ID' })
  @ApiParam({
    name: 'id',
    description: 'ID de producto a actualizar',
    type: String,
  })
  @ApiResponse({
    status: 200,
    description: 'Producto actualizado exitosamente.',
    type: Product,
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateProductDto: UpdateProductDto,
  ) {
    return this.productsService.update(id, updateProductDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar un producto por su ID' })
  @ApiParam({
    name: 'id',
    description: 'ID del producto a eliminar',
    type: String,
  })
  @ApiResponse({
    status: 204,
    description: 'Producto eliminado exitosamente.',
  })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.productsService.remove(id);
  }
}
