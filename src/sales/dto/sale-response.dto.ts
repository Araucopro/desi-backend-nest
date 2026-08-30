import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DteDocumentResponseDto } from '../../dte/dto/dte-document-response.dto';
import {
  DteDocumentPaymentType,
  DteDocumentStatus,
} from '../../dte/entities/dte-document.entity';
import { StoreType } from '../../stores/entities/store.entity';
import { SalePaymentType, SaleStatus, SaleType } from '../entities/sale.entity';

export class SaleItemDto {
  @ApiProperty({
    description: 'ID del ítem de venta',
    example: 'sale-item-uuid',
  })
  saleItemID!: string;

  @ApiProperty({
    description: 'ID de la venta asociada',
    example: 'sale-uuid',
  })
  saleID!: string;

  @ApiProperty({
    description: 'ID del producto en tienda (StoreProduct)',
    example: 'store-product-uuid',
  })
  storeProductID!: string;

  @ApiProperty({
    description: 'ID de la variación',
    example: 'variation-uuid',
  })
  variationID!: string;

  @ApiProperty({
    description: 'Nombre del producto',
    example: 'Cemento 25kg',
  })
  productName!: string;

  @ApiProperty({ description: 'SKU de la variación', example: 'CEM-25' })
  sku!: string;

  @ApiProperty({ description: 'Cantidad vendida', example: 2 })
  quantity!: number;

  @ApiProperty({
    description: 'Precio unitario de venta en CLP',
    example: 7990,
  })
  unitPrice!: number;

  @ApiProperty({ description: 'Costo unitario en CLP', example: 5000 })
  unitCost!: number;

  @ApiProperty({
    description: 'Total de la línea en CLP',
    example: 15980,
  })
  lineTotal!: number;

  @ApiProperty({
    description: 'Fecha de creación en formato ISO 8601',
    type: Date,
    example: '2026-08-18T12:00:00.000Z',
  })
  createdAt!: Date;
}

export class SaleStoreDto {
  @ApiProperty({
    description: 'ID de la tienda',
    example: 'store-uuid',
  })
  storeID!: string;

  @ApiProperty({
    description: 'Nombre de la tienda',
    example: 'Tienda Centro',
  })
  name!: string;

  @ApiProperty({ description: 'RUT de la tienda', example: '76123456-7' })
  rut!: string;

  @ApiProperty({
    description: 'Ubicación de la tienda',
    example: 'Centro',
  })
  location!: string;

  @ApiProperty({ description: 'Dirección de la tienda' })
  address!: string;

  @ApiProperty({ description: 'Teléfono de la tienda' })
  phone!: string;

  @ApiProperty({ description: 'Ciudad de la tienda' })
  city!: string;

  @ApiProperty({ description: 'Email de la tienda' })
  email!: string;

  @ApiProperty({
    description: 'Tipo de tienda',
    enum: StoreType,
  })
  type!: StoreType;

  @ApiProperty({
    description: 'Indica si la tienda es la tienda central',
    example: false,
  })
  isCentralStore!: boolean;

  @ApiPropertyOptional({
    description: 'Imagen de la tienda',
    nullable: true,
  })
  storeImg?: string | null;

  @ApiPropertyOptional({
    description: 'Giro comercial',
    nullable: true,
  })
  giro?: string | null;

  @ApiPropertyOptional({
    description: 'Actividad económica (acteco)',
    nullable: true,
  })
  acteco?: string | null;

  @ApiPropertyOptional({
    description: 'Código de sucursal SII',
    nullable: true,
  })
  cdgSIISucur?: string | null;

  @ApiPropertyOptional({
    description: 'Razón social',
    nullable: true,
  })
  businessName?: string | null;

  @ApiProperty({
    description: 'Fecha de creación en formato ISO 8601',
    type: Date,
    example: '2026-08-18T12:00:00.000Z',
  })
  createdAt!: Date;

  @ApiProperty({
    description: 'Fecha de actualización en formato ISO 8601',
    type: Date,
    example: '2026-08-18T12:00:00.000Z',
  })
  updatedAt!: Date;
}

export class SaleReceiverDto {
  @ApiPropertyOptional({
    description: 'RUT del receptor',
    example: '76123456-7',
  })
  rut?: string;

  @ApiPropertyOptional({
    description: 'Nombre del receptor',
    example: 'Empresa Ltda.',
  })
  name?: string;

  @ApiPropertyOptional({
    description: 'Email del receptor',
    example: 'cliente@empresa.cl',
  })
  email?: string;

  @ApiPropertyOptional({
    description: 'Dirección del receptor',
  })
  address?: string;

  @ApiPropertyOptional({
    description: 'Ciudad del receptor',
  })
  city?: string;

  @ApiPropertyOptional({
    description: 'Giro del receptor',
  })
  giro?: string;
}

export class DteDocumentSummaryDto {
  @ApiProperty({
    description: 'ID interno del documento DTE',
    example: 'dte-uuid',
  })
  dteDocumentID!: string;

  @ApiProperty({
    description: 'Token del documento generado',
  })
  token!: string;

  @ApiProperty({
    description: 'Folio del documento',
    example: 3130,
  })
  folio!: number;

  @ApiProperty({
    description: 'Estado de emisión del documento',
    enum: DteDocumentStatus,
    example: DteDocumentStatus.EMITIDO,
  })
  status!: DteDocumentStatus;

  @ApiProperty({
    description: 'Tipo de documento tributario (33 factura, 39 boleta)',
    example: 39,
    nullable: true,
  })
  documentType!: number | null;

  @ApiProperty({
    description: 'Tipo de pago del documento',
    enum: DteDocumentPaymentType,
    example: DteDocumentPaymentType.CASH,
  })
  paymentType!: DteDocumentPaymentType;

  @ApiProperty({
    description: 'Total del documento en CLP',
    example: 15980,
  })
  total!: number;

  @ApiProperty({
    description: 'Total neto en CLP',
    example: 13429,
  })
  netTotal!: number;

  @ApiProperty({
    description: 'IVA en CLP',
    example: 2551,
  })
  taxTotal!: number;

  @ApiProperty({
    description: 'Costo total en CLP',
    example: 10000,
  })
  cogsTotal!: number;

  @ApiProperty({
    description: 'Detalle del error cuando el DTE no fue emitido',
    nullable: true,
  })
  errorDetail!: string | null;

  @ApiProperty({
    description: 'Fecha de emisión del documento (YYYY-MM-DD)',
    type: 'string',
    format: 'date',
    example: '2026-08-18',
  })
  issueDate!: Date;

  @ApiProperty({
    description: 'ID de la venta asociada, si existe',
    example: 'sale-uuid',
    nullable: true,
  })
  saleID!: string | null;

  @ApiProperty({
    description: 'Fecha de creación en formato ISO 8601',
    type: Date,
    example: '2026-08-18T12:00:00.000Z',
  })
  createdAt!: Date;

  @ApiProperty({
    description: 'Fecha de actualización en formato ISO 8601',
    type: Date,
    example: '2026-08-18T12:00:00.000Z',
  })
  updatedAt!: Date;
}

export class SaleDto {
  @ApiProperty({
    description: 'ID de la venta',
    example: 'sale-uuid',
  })
  saleID!: string;

  @ApiProperty({
    description: 'ID de la tienda',
    example: 'store-uuid',
  })
  storeID!: string;

  @ApiProperty({
    description: 'ID del usuario que registró la venta',
    example: 'user-uuid',
    nullable: true,
  })
  userID!: string | null;

  @ApiProperty({
    description: 'Tipo de venta',
    enum: SaleType,
    example: SaleType.NOTA_VENTA,
  })
  saleType!: SaleType;

  @ApiProperty({
    description: 'Estado de la venta',
    enum: SaleStatus,
    example: SaleStatus.EMITIDA,
  })
  status!: SaleStatus;

  @ApiProperty({
    description: 'Tipo de pago',
    enum: SalePaymentType,
    example: SalePaymentType.CASH,
  })
  paymentType!: SalePaymentType;

  @ApiProperty({
    description: 'Folio de la venta (null en notas de venta sin convertir)',
    example: 1024,
    nullable: true,
  })
  folio!: number | null;

  @ApiProperty({
    description: 'Fecha de emisión de la venta (YYYY-MM-DD)',
    type: 'string',
    format: 'date',
    example: '2026-08-18',
  })
  issueDate!: Date;

  @ApiProperty({
    description: 'Receptor de la venta (obligatorio en facturas)',
    type: SaleReceiverDto,
    nullable: true,
  })
  receiver!: SaleReceiverDto | null;

  @ApiProperty({
    description: 'Subtotal en CLP (sin impuestos)',
    example: 15980,
  })
  subtotal!: number;

  @ApiProperty({
    description: 'Descuento total en CLP',
    example: 0,
  })
  discount!: number;

  @ApiProperty({
    description: 'Total neto en CLP',
    example: 15980,
  })
  netTotal!: number;

  @ApiProperty({
    description: 'IVA en CLP',
    example: 3036,
  })
  taxTotal!: number;

  @ApiProperty({
    description: 'Total de la venta en CLP',
    example: 19016,
  })
  total!: number;

  @ApiProperty({
    description: 'Costo total en CLP',
    example: 10000,
  })
  cogsTotal!: number;

  @ApiProperty({
    description: 'ID del DTE asociado, si existe',
    example: 'dte-uuid',
    nullable: true,
  })
  dteDocumentID!: string | null;

  @ApiProperty({
    description: 'Clave de idempotencia usada para crear la venta',
    nullable: true,
  })
  idempotencyKey!: string | null;

  @ApiProperty({
    description: 'Fecha de creación en formato ISO 8601',
    type: Date,
    example: '2026-08-18T12:00:00.000Z',
  })
  createdAt!: Date;

  @ApiProperty({
    description: 'Fecha de actualización en formato ISO 8601',
    type: Date,
    example: '2026-08-18T12:00:00.000Z',
  })
  updatedAt!: Date;

  @ApiProperty({
    description: 'Tienda asociada a la venta',
    type: SaleStoreDto,
  })
  store!: SaleStoreDto;

  @ApiProperty({
    description: 'Ítems de la venta',
    type: [SaleItemDto],
  })
  items!: SaleItemDto[];

  @ApiProperty({
    description: 'Documento DTE asociado a la venta, si existe',
    type: DteDocumentSummaryDto,
    nullable: true,
  })
  dteDocument!: DteDocumentSummaryDto | null;
}

export class SaleListMetaDto {
  @ApiProperty({ description: 'Página actual', example: 1 })
  page!: number;

  @ApiProperty({ description: 'Tamaño de página', example: 50 })
  limit!: number;

  @ApiProperty({ description: 'Total de ventas', example: 120 })
  total!: number;
}

export class SaleResponseDto {
  @ApiProperty({
    description:
      'Venta persistida con items, tienda y documento DTE asociado (si existe)',
    type: SaleDto,
  })
  sale!: SaleDto;

  @ApiPropertyOptional({
    description: 'Respuesta del DTE cuando aplica',
    type: DteDocumentResponseDto,
    nullable: true,
  })
  dte?: DteDocumentResponseDto | null;
}

export class SaleListResponseDto {
  @ApiProperty({
    description: 'Ventas con su DTE asociado (si existe)',
    type: [SaleResponseDto],
  })
  sales!: SaleResponseDto[];

  @ApiProperty({
    description: 'Metadatos de paginación',
    type: SaleListMetaDto,
  })
  meta!: SaleListMetaDto;
}
