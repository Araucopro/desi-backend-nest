import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const MAX_BULK_CATEGORIES = 500;

export class BulkCategoryItemDto {
  @ApiPropertyOptional({
    description:
      'ID de una categoría existente que se desea actualizar. Si se omite, se busca por nombre (sin distinguir mayúsculas/minúsculas).',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsOptional()
  @IsUUID()
  categoryID?: string;

  @ApiProperty({
    description: 'Nombre de la categoría',
    example: 'Vestuario',
  })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({
    description:
      'ID de la categoría padre (para crear o mover a una subcategoría). En actualizaciones, si se omite se conserva el padre actual.',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsOptional()
  @IsUUID()
  parentID?: string;
}

export class CreateCategoriesBulkDto {
  @ApiProperty({
    description: `Categorías a crear o actualizar masivamente. Máximo ${MAX_BULK_CATEGORIES} por llamada.`,
    type: [BulkCategoryItemDto],
    example: [
      { name: 'Vestuario' },
      { name: 'Poleras', parentID: '123e4567-e89b-12d3-a456-426614174000' },
      {
        categoryID: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Calzado',
      },
    ],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_BULK_CATEGORIES)
  @ValidateNested({ each: true })
  @Type(() => BulkCategoryItemDto)
  items!: BulkCategoryItemDto[];
}
