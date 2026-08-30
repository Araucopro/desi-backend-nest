import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DteDocumentResponseDto } from '../../dte/dto/dte-document-response.dto';
import {
  DteDocumentPaymentType,
  DteDocumentStatus,
} from '../../dte/entities/dte-document.entity';
import { ReturnStatus, ReturnType } from '../entities/return.entity';
import { ReturnItemCondition } from '../entities/return-item.entity';

export class ReturnItemDto {
  @ApiProperty({ description: 'ID del ítem de devolución' })
  returnItemID!: string;

  @ApiProperty({ description: 'ID de la devolución' })
  returnID!: string;

  @ApiProperty({ description: 'ID del ítem de la venta original' })
  saleItemID!: string;

  @ApiProperty({ description: 'ID del producto en tienda' })
  storeProductID!: string;

  @ApiProperty({ description: 'ID de la variación' })
  variationID!: string;

  @ApiProperty({ description: 'Nombre del producto' })
  productName!: string;

  @ApiProperty({ description: 'SKU de la variación' })
  sku!: string;

  @ApiProperty({ description: 'Cantidad devuelta', example: 1 })
  quantity!: number;

  @ApiProperty({
    description: 'Precio unitario original en CLP',
    example: 1190,
  })
  unitPrice!: number;

  @ApiProperty({ description: 'Costo unitario original en CLP', example: 400 })
  unitCost!: number;

  @ApiProperty({ description: 'Total de la línea en CLP', example: 1190 })
  lineTotal!: number;

  @ApiProperty({
    description: 'Condición del producto devuelto (SELLABLE o DEFECTIVE)',
    enum: ReturnItemCondition,
    example: ReturnItemCondition.SELLABLE,
  })
  condition!: ReturnItemCondition;

  @ApiProperty({ description: 'Fecha de creación ISO 8601', type: Date })
  createdAt!: Date;
}

export class ReturnSaleDto {
  @ApiProperty({ description: 'ID de la venta original' })
  saleID!: string;

  @ApiProperty({ description: 'Tipo de venta' })
  saleType!: string;

  @ApiProperty({ description: 'Estado de la venta' })
  status!: string;

  @ApiProperty({ description: 'Folio de la venta', nullable: true })
  folio!: number | null;

  @ApiProperty({ description: 'Fecha de emisión de la venta', type: Date })
  issueDate!: Date;

  @ApiProperty({ description: 'Total de la venta en CLP' })
  total!: number;

  @ApiProperty({ description: 'Total neto de la venta en CLP' })
  netTotal!: number;

  @ApiProperty({ description: 'IVA de la venta en CLP' })
  taxTotal!: number;

  @ApiProperty({ description: 'ID del DTE asociado', nullable: true })
  dteDocumentID!: string | null;
}

export class ReturnStoreDto {
  @ApiProperty({ description: 'ID de la tienda' })
  storeID!: string;

  @ApiProperty({ description: 'Nombre de la tienda' })
  name!: string;

  @ApiProperty({ description: 'RUT de la tienda' })
  rut!: string;

  @ApiProperty({ description: 'Ubicación de la tienda' })
  location!: string;
}

export class ReturnDteSummaryDto {
  @ApiProperty({ description: 'ID interno del documento DTE' })
  dteDocumentID!: string;

  @ApiProperty({ description: 'Token del documento generado' })
  token!: string;

  @ApiProperty({ description: 'Folio del documento', example: 3130 })
  folio!: number;

  @ApiProperty({ description: 'Estado de emisión', enum: DteDocumentStatus })
  status!: DteDocumentStatus;

  @ApiProperty({ description: 'Tipo de documento tributario (61 NCE)' })
  documentType!: number | null;

  @ApiProperty({ description: 'Forma de pago', enum: DteDocumentPaymentType })
  paymentType!: DteDocumentPaymentType;

  @ApiProperty({ description: 'Total del documento en CLP' })
  total!: number;
}

export class ReturnDto {
  @ApiProperty({ description: 'ID de la devolución' })
  returnID!: string;

  @ApiProperty({ description: 'ID de la tienda' })
  storeID!: string;

  @ApiProperty({ description: 'ID de la venta original' })
  saleID!: string;

  @ApiProperty({ description: 'Tipo de devolución', enum: ReturnType })
  returnType!: ReturnType;

  @ApiProperty({ description: 'Estado de la devolución', enum: ReturnStatus })
  status!: ReturnStatus;

  @ApiPropertyOptional({
    description: 'Motivo de la devolución',
    nullable: true,
  })
  reason?: string | null;

  @ApiProperty({ description: 'Monto de descuento en CLP', example: 0 })
  discountAmount!: number;

  @ApiProperty({
    description: 'Folio interno de la devolución',
    nullable: true,
  })
  folio!: number | null;

  @ApiProperty({ description: 'ID del DTE NCE asociado', nullable: true })
  dteDocumentID!: string | null;

  @ApiProperty({ description: 'Fecha de emisión de la devolución', type: Date })
  issueDate!: Date;

  @ApiProperty({ description: 'Subtotal en CLP' })
  subtotal!: number;

  @ApiProperty({ description: 'Total neto en CLP' })
  netTotal!: number;

  @ApiProperty({ description: 'IVA en CLP' })
  taxTotal!: number;

  @ApiProperty({ description: 'Total de la devolución en CLP' })
  total!: number;

  @ApiProperty({ description: 'Costo total devuelto en CLP' })
  cogsTotal!: number;

  @ApiPropertyOptional({
    description: 'Usuario que creó la devolución',
    nullable: true,
  })
  userID?: string | null;

  @ApiPropertyOptional({
    description: 'Usuario que aprobó la devolución',
    nullable: true,
  })
  approvedBy?: string | null;

  @ApiPropertyOptional({
    description: 'Fecha de aprobación',
    nullable: true,
    type: Date,
  })
  approvedAt?: Date | null;

  @ApiPropertyOptional({
    description: 'Fecha de completado',
    nullable: true,
    type: Date,
  })
  completedAt?: Date | null;

  @ApiProperty({ description: 'Fecha de creación ISO 8601', type: Date })
  createdAt!: Date;

  @ApiProperty({ description: 'Fecha de actualización ISO 8601', type: Date })
  updatedAt!: Date;

  @ApiProperty({ description: 'Ítems devueltos', type: [ReturnItemDto] })
  items!: ReturnItemDto[];

  @ApiProperty({ description: 'Venta original', type: ReturnSaleDto })
  sale!: ReturnSaleDto;

  @ApiProperty({ description: 'Tienda de la devolución', type: ReturnStoreDto })
  store!: ReturnStoreDto;

  @ApiPropertyOptional({
    description: 'Documento DTE NCE asociado',
    type: ReturnDteSummaryDto,
    nullable: true,
  })
  dteDocument?: ReturnDteSummaryDto | null;
}

export class ReturnResponseDto {
  @ApiProperty({ description: 'Devolución persistida', type: ReturnDto })
  ret!: ReturnDto;

  @ApiPropertyOptional({
    description: 'Respuesta del DTE cuando aplica',
    type: DteDocumentResponseDto,
    nullable: true,
  })
  dte?: DteDocumentResponseDto | null;
}

export class ReturnListMetaDto {
  @ApiProperty({ description: 'Página actual', example: 1 })
  page!: number;

  @ApiProperty({ description: 'Tamaño de página', example: 50 })
  limit!: number;

  @ApiProperty({ description: 'Total de devoluciones', example: 12 })
  total!: number;
}

export class ReturnListResponseDto {
  @ApiProperty({ description: 'Devoluciones', type: [ReturnResponseDto] })
  returns!: ReturnResponseDto[];

  @ApiProperty({
    description: 'Metadatos de paginación',
    type: ReturnListMetaDto,
  })
  meta!: ReturnListMetaDto;
}
