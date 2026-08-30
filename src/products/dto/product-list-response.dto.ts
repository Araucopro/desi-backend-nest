import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaDto } from '../../common/dto/pagination-meta.dto';
import { Product } from '../entities/product.entity';

export class ProductListResponseDto {
  @ApiProperty({
    type: [Product],
    description: 'Productos de la página',
  })
  products!: Product[];

  @ApiProperty({
    type: PaginationMetaDto,
    description: 'Metadatos de paginación',
  })
  meta!: PaginationMetaDto;
}
