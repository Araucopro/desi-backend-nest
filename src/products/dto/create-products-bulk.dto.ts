import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProductGenre } from '../entities/product.entity';
import { CreateProductVariationDto } from './create-product-variation.dto';

export const MAX_BULK_PRODUCTS = 100;

export class BulkProductItemDto {
  @ApiProperty({
    description:
      'Nombre del producto. Se usa para detectar si ya existe, ignorando mayúsculas/minúsculas y espacios.',
    example: 'Camiseta Básica',
  })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({
    description:
      'Nombre de la categoría. Si no existe en el tenant, se crea automáticamente como categoría raíz.',
    example: 'Vestuario',
  })
  @IsString()
  @IsNotEmpty()
  categoryName?: string;

  @ApiPropertyOptional({
    description: 'URL de la imagen del producto',
    example: 'https://example.com/image.jpg',
  })
  @IsString()
  @IsOptional()
  image?: string;

  @ApiPropertyOptional({
    description: 'Marca del producto',
    example: 'Marca Famosa',
  })
  @IsString()
  @IsOptional()
  brand?: string;

  @ApiPropertyOptional({
    description: 'Género al que se dirige el producto',
    enum: ProductGenre,
    example: ProductGenre.UNISEX,
  })
  @IsEnum(ProductGenre)
  @IsOptional()
  genre?: ProductGenre;

  @ApiPropertyOptional({
    description: 'Descripción detallada del producto',
    example: 'Una camiseta de algodón suave y duradera.',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    description: 'Lista de variantes del producto. Debe contener al menos una.',
    type: [CreateProductVariationDto],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateProductVariationDto)
  variations!: CreateProductVariationDto[];
}

export class CreateProductsBulkDto {
  @ApiProperty({
    description: `Productos a crear o actualizar masivamente. Máximo ${MAX_BULK_PRODUCTS} por llamada.`,
    type: [BulkProductItemDto],
    example: [
      {
        name: 'Camiseta Básica',
        categoryName: 'Vestuario',
        brand: 'Marca Famosa',
        genre: ProductGenre.UNISEX,
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
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_BULK_PRODUCTS)
  @ValidateNested({ each: true })
  @Type(() => BulkProductItemDto)
  items!: BulkProductItemDto[];
}
