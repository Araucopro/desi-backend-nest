import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsArray,
  ValidateNested,
  ArrayMinSize,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ProductGenre } from '../entities/product.entity';
import { CreateProductVariationDto } from './create-product-variation.dto';

export class CreateProductDto {
  @ApiProperty({
    description: 'Nombre del producto principal',
    example: 'Camiseta Básica',
  })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({
    description: 'ID de la categoría a la que pertenece el producto',
    example: 'a1b2c3d4-e5f6-7890-1234-567890abcdef',
    required: false,
  })
  @IsUUID()
  @IsOptional()
  categoryID?: string;

  @ApiProperty({
    description: 'URL de la imagen del producto',
    example: 'https://example.com/image.jpg',
    required: false,
  })
  @IsString()
  @IsOptional()
  image?: string;

  @ApiProperty({
    description: 'Marca del producto',
    example: 'Marca Famosa',
    required: false,
  })
  @IsString()
  @IsOptional()
  brand?: string;

  @ApiProperty({
    description: 'Género al que se dirige el producto',
    enum: ProductGenre,
    example: ProductGenre.UNISEX,
    required: false,
  })
  @IsEnum(ProductGenre)
  @IsOptional()
  genre?: ProductGenre;

  @ApiProperty({
    description: 'Descripción detallada del producto',
    example: 'Una camiseta de algodón suave y duradera.',
    required: false,
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    description: 'Lista de variantes del producto. Debe contener al menos una.',
    type: [CreateProductVariationDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @Type(() => CreateProductVariationDto)
  variations!: CreateProductVariationDto[];
}
