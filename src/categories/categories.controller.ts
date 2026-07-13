import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { Category } from './entities/category.entity';

@ApiTags('Categorías')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  @ApiOperation({
    summary: 'Crear una nueva categoría',
    description:
      'Crea una categoría de productos. Puede ser una categoría raíz o una subcategoría si se especifica parentID.',
  })
  @ApiResponse({
    status: 201,
    description: 'Categoría creada exitosamente.',
    type: Category,
  })
  create(@Body() createCategoryDto: CreateCategoryDto) {
    return this.categoriesService.create(createCategoryDto);
  }

  @Get()
  @ApiOperation({
    summary: 'Obtener todas las categorías raíz',
    description:
      'Retorna solo las categorías principales (sin padre) con sus subcategorías anidadas en la propiedad children.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de categorías raíz con sus hijos.',
    type: [Category],
  })
  findAll() {
    return this.categoriesService.findAll();
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Obtener una categoría por ID',
    description:
      'Retorna la información de una categoría específica incluyendo su padre y sus hijos.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID de la categoría',
    type: String,
  })
  @ApiResponse({
    status: 200,
    description: 'Categoría encontrada.',
    type: Category,
  })
  @ApiResponse({ status: 404, description: 'Categoría no encontrada.' })
  findOne(@Param('id') id: string) {
    return this.categoriesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Actualizar una categoría',
    description:
      'Modifica el nombre o la categoría padre de una categoría existente.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID de la categoría a actualizar',
    type: String,
  })
  @ApiResponse({
    status: 200,
    description: 'Categoría actualizada exitosamente.',
    type: Category,
  })
  @ApiResponse({ status: 404, description: 'Categoría no encontrada.' })
  update(
    @Param('id') id: string,
    @Body() updateCategoryDto: UpdateCategoryDto,
  ) {
    return this.categoriesService.update(id, updateCategoryDto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Eliminar una categoría',
    description:
      'Elimina una categoría del sistema. Si tiene subcategorías, estas también serán eliminadas.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID de la categoría a eliminar',
    type: String,
  })
  @ApiResponse({
    status: 200,
    description: 'Categoría eliminada exitosamente.',
  })
  @ApiResponse({ status: 404, description: 'Categoría no encontrada.' })
  remove(@Param('id') id: string) {
    return this.categoriesService.remove(id);
  }
}
