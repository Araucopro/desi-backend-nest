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
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductListQueryDto } from './dto/product-list.query.dto';
import { ProductListResponseDto } from './dto/product-list-response.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { Product } from './entities/product.entity';
import { Public } from '../auth/decorators/public.decorator';

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
