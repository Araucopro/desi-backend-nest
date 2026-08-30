import { ApiProperty } from '@nestjs/swagger';

export class PaginationMetaDto {
  @ApiProperty({
    description: 'Página actual (1-based)',
    example: 1,
  })
  page!: number;

  @ApiProperty({
    description: 'Tamaño de página',
    example: 10,
  })
  limit!: number;

  @ApiProperty({
    description: 'Total de elementos que coinciden con el filtro',
    example: 120,
  })
  total!: number;
}
