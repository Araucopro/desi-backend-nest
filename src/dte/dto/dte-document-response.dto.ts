import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DteDocumentResponseDto {
  @ApiProperty({
    description: 'ID interno del documento DTE',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  dteDocumentID!: string;

  @ApiProperty({
    description: 'Token del documento generado',
    example: 'b822a58da11856bb09423a0a6fba59f5e089bd738e01d3ea670c45d4686f66d6',
  })
  TOKEN!: string;

  @ApiProperty({
    description: 'Folio del documento',
    example: 3130,
  })
  FOLIO!: number;

  @ApiProperty({
    description: 'Estado de emisión del documento',
    example: 'EMITIDO',
  })
  STATUS!: string;

  @ApiPropertyOptional({
    description: 'Contenido PDF en Base64 si se solicita',
  })
  PDF?: string;

  @ApiPropertyOptional({
    description: 'Contenido XML en Base64 si se solicita',
  })
  XML?: string;

  @ApiPropertyOptional({
    description: 'Alertas o advertencias retornadas por el proveedor DTE',
  })
  WARNING?: unknown[];

  @ApiPropertyOptional({
    description: 'Venta asociada al documento (conversión nota de venta)',
  })
  saleID?: string | null;

  [key: string]: unknown;
}
