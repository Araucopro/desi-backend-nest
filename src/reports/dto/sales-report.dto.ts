import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SalesReportGroupedItemDto {
  @ApiProperty({
    description: 'Clave del grupo: tipo de pago o estado del documento',
    example: 'Efectivo',
  })
  key!: string;

  @ApiProperty({ description: 'Cantidad de ventas en el grupo', example: 12 })
  count!: number;

  @ApiProperty({
    description: 'Total acumulado del grupo en CLP',
    example: 150000,
  })
  total!: number;
}

export class SalesReportPeriodSummaryDto {
  @ApiProperty({ description: 'Cantidad de ventas del periodo', example: 5 })
  count!: number;

  @ApiProperty({
    description: 'Total de ventas del periodo en CLP',
    example: 80000,
  })
  total!: number;
}

export class SalesReportPeriodSummariesDto {
  @ApiProperty({
    type: SalesReportPeriodSummaryDto,
    description: 'Resumen de ventas de hoy',
  })
  today!: SalesReportPeriodSummaryDto;

  @ApiProperty({
    type: SalesReportPeriodSummaryDto,
    description: 'Resumen de ventas de ayer',
  })
  yesterday!: SalesReportPeriodSummaryDto;

  @ApiProperty({
    type: SalesReportPeriodSummaryDto,
    description: 'Resumen de ventas del mes actual',
  })
  month!: SalesReportPeriodSummaryDto;
}

export class SalesReportStoreDto {
  @ApiProperty({ description: 'ID de la tienda', example: 'store-uuid' })
  storeID!: string;

  @ApiProperty({ description: 'RUT de la tienda', example: '76123456-7' })
  rut!: string;

  @ApiProperty({ description: 'Nombre de la tienda', example: 'Tienda Centro' })
  name!: string;

  @ApiPropertyOptional({
    description: 'Ubicación de la tienda',
    nullable: true,
  })
  location?: string | null;
}

export class SalesReportSaleItemDto {
  @ApiPropertyOptional({
    description:
      'ID del DTE cuando la venta proviene de un documento electrónico',
    nullable: true,
  })
  dteDocumentID?: string | null;

  @ApiPropertyOptional({
    description: 'ID de la venta cuando es nota de venta',
    nullable: true,
  })
  saleID?: string | null;

  @ApiPropertyOptional({
    description: 'Tipo de venta cuando es nota de venta (NOTA_VENTA)',
  })
  saleType?: string;

  @ApiPropertyOptional({
    description: 'Token del documento generado',
    nullable: true,
  })
  token?: string | null;

  @ApiPropertyOptional({
    description: 'Folio del documento',
    nullable: true,
  })
  folio?: number | null;

  @ApiProperty({ description: 'Estado del documento', example: 'EMITIDO' })
  status!: string;

  @ApiProperty({ description: 'Tipo de pago', example: 'Efectivo' })
  paymentType!: string;

  @ApiProperty({ description: 'Total de la venta en CLP', example: 150000 })
  total!: number;

  @ApiPropertyOptional({
    description: 'Tipo de documento tributario (DTE)',
    nullable: true,
  })
  documentType?: number | null;

  @ApiProperty({
    description: 'Fecha de creación en formato ISO 8601',
    type: Date,
    example: '2026-08-18T12:00:00.000Z',
  })
  createdAt!: Date;

  @ApiProperty({
    description: 'Fecha de última actualización en formato ISO 8601',
    type: Date,
    example: '2026-08-18T12:00:00.000Z',
  })
  updatedAt!: Date;

  @ApiProperty({
    description: 'Tienda asociada a la venta',
    type: SalesReportStoreDto,
    nullable: true,
  })
  store!: SalesReportStoreDto | null;

  @ApiProperty({
    description:
      'Ítems de la venta (estructura según origen: DTE o nota de venta)',
    type: 'array',
    items: { type: 'object', additionalProperties: true },
  })
  items!: Array<Record<string, unknown>>;

  @ApiProperty({
    description: 'Payload normalizado del documento',
    type: 'object',
    additionalProperties: true,
  })
  payloadNormalized!: Record<string, unknown>;
}

export class SalesReportMetaDto {
  @ApiProperty({ description: 'Página actual', example: 1 })
  page!: number;

  @ApiProperty({ description: 'Tamaño de página', example: 50 })
  limit!: number;

  @ApiProperty({
    description: 'Total de ventas dentro del rango',
    example: 120,
  })
  total!: number;
}

export class SalesReportResponseDto {
  @ApiProperty({
    type: [SalesReportGroupedItemDto],
    description: 'Ventas agrupadas por tipo de pago',
  })
  groupedByPaymentType!: SalesReportGroupedItemDto[];

  @ApiProperty({
    type: [SalesReportGroupedItemDto],
    description: 'Ventas agrupadas por estado',
  })
  groupedByStatus!: SalesReportGroupedItemDto[];

  @ApiProperty({
    type: SalesReportPeriodSummariesDto,
    description: 'Resúmenes por periodo: hoy, ayer y mes',
  })
  periodSummary!: SalesReportPeriodSummariesDto;

  @ApiProperty({
    type: [SalesReportSaleItemDto],
    description: 'Listado de ventas dentro del rango (DTE y notas de venta)',
  })
  sales!: SalesReportSaleItemDto[];

  @ApiProperty({
    type: SalesReportMetaDto,
    description: 'Metadatos de paginación',
  })
  meta!: SalesReportMetaDto;
}
