import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { ProductGenre } from '../entities/product.entity';

export class ProductListQueryDto extends PaginationDto {
  @ApiPropertyOptional({
    description:
      'Búsqueda parcial (sin distinguir mayúsculas): nombre o marca del producto, categoría, SKU, supplierSku o código de barras de la variante',
    example: 'CEM-25',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Código de barras exacto de la variante (EAN/UPC)',
    example: '7801234567890',
  })
  @IsOptional()
  @IsString()
  barcode?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por categoría del producto',
    example: 'category-uuid',
  })
  @IsOptional()
  @IsUUID()
  categoryID?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por género del producto',
    enum: ProductGenre,
  })
  @IsOptional()
  @IsEnum(ProductGenre)
  genre?: ProductGenre;
}
