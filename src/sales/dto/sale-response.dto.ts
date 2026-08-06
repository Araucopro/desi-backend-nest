import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DteDocumentResponseDto } from '../../dte/dto/dte-document-response.dto';

export class SaleResponseDto {
  @ApiProperty({ description: 'Venta persistida' })
  sale!: unknown;

  @ApiPropertyOptional({
    description: 'Respuesta del DTE cuando aplica',
    type: DteDocumentResponseDto,
  })
  dte?: DteDocumentResponseDto | null;
}

export class SaleListResponseDto {
  @ApiProperty({
    description: 'Ventas con su DTE asociado (si existe)',
    type: [SaleResponseDto],
  })
  sales!: SaleResponseDto[];

  @ApiProperty({ description: 'Metadatos de paginación' })
  meta!: { page: number; limit: number; total: number };
}
