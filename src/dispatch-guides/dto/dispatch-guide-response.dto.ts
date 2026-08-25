import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DteDocumentResponseDto } from '../../dte/dto/dte-document-response.dto';
import { DispatchGuideStatus } from '../entities/dispatch-guide.entity';
import type {
  DispatchGuideDestination,
  DispatchGuideReceiver,
  DispatchGuideTransport,
} from '../entities/dispatch-guide.entity';

export class DispatchGuideItemDto {
  @ApiProperty({ description: 'ID del ítem de la guía' })
  dispatchGuideItemID!: string;

  @ApiProperty({ description: 'ID de la guía' })
  dispatchGuideID!: string;

  @ApiProperty({ description: 'ID del producto en tienda' })
  storeProductID!: string;

  @ApiProperty({ description: 'ID de la variación' })
  variationID!: string;

  @ApiProperty({ description: 'Nombre del producto' })
  productName!: string;

  @ApiProperty({ description: 'SKU de la variación' })
  sku!: string;

  @ApiProperty({ description: 'Cantidad despachada' })
  quantity!: number;

  @ApiProperty({ description: 'Precio unitario en CLP' })
  unitPrice!: number;

  @ApiProperty({ description: 'Costo unitario en CLP' })
  unitCost!: number;

  @ApiProperty({ description: 'Total de la línea en CLP' })
  lineTotal!: number;

  @ApiProperty({ description: 'Fecha de creación', type: Date })
  createdAt!: Date;
}

export class DispatchGuideReceiverDto {
  @ApiProperty({ description: 'RUT del receptor' })
  rut!: string;

  @ApiProperty({ description: 'Nombre o razón social del receptor' })
  name!: string;

  @ApiPropertyOptional({ description: 'Dirección del receptor' })
  address?: string;

  @ApiPropertyOptional({ description: 'Comuna o ciudad del receptor' })
  city?: string;

  @ApiPropertyOptional({ description: 'Giro del receptor' })
  giro?: string;

  @ApiPropertyOptional({ description: 'Correo del receptor' })
  email?: string;
}

export class DispatchGuideDestinationDto {
  @ApiProperty({ description: 'Dirección de destino' })
  address!: string;

  @ApiProperty({ description: 'Comuna o ciudad de destino' })
  city!: string;
}

export class DispatchGuideTransportDto {
  @ApiPropertyOptional({ description: 'Patente del vehículo' })
  patente?: string;

  @ApiPropertyOptional({ description: 'RUT del conductor' })
  rutConductor?: string;

  @ApiPropertyOptional({ description: 'Nombre del conductor' })
  nombreConductor?: string;

  @ApiPropertyOptional({ description: 'Fecha de traslado' })
  fechaTraslado?: string;
}

export class DispatchGuideReferenceItemDto {
  @ApiProperty({ description: 'ID del ítem de consumo' })
  dispatchGuideReferenceItemID!: string;

  @ApiProperty({ description: 'ID de la variación consumida' })
  variationID!: string;

  @ApiProperty({ description: 'Cantidad consumida' })
  quantity!: number;
}

export class DispatchGuideReferenceDto {
  @ApiProperty({ description: 'ID del vínculo' })
  dispatchGuideReferenceID!: string;

  @ApiProperty({
    description: 'Cantidades consumidas de la guía por este documento',
    type: [DispatchGuideReferenceItemDto],
  })
  items!: DispatchGuideReferenceItemDto[];

  @ApiProperty({ description: 'ID del documento DTE que referencia la guía' })
  dteDocumentID!: string;

  @ApiPropertyOptional({
    description: 'ID de la venta que referencia la guía',
    nullable: true,
  })
  saleID!: string | null;

  @ApiProperty({ description: 'Fecha de creación', type: Date })
  createdAt!: Date;
}

export class DispatchGuideDto {
  @ApiProperty({ description: 'ID de la guía de despacho' })
  dispatchGuideID!: string;

  @ApiProperty({ description: 'ID de la tienda' })
  storeID!: string;

  @ApiProperty({ description: 'Estado de la guía', enum: DispatchGuideStatus })
  status!: DispatchGuideStatus;

  @ApiPropertyOptional({
    description: 'Folio SII asignado por Openfactura',
    nullable: true,
  })
  folio!: number | null;

  @ApiPropertyOptional({
    description: 'ID del documento DTE 52 asociado',
    nullable: true,
  })
  dteDocumentID!: string | null;

  @ApiProperty({
    description: 'Fecha de emisión',
    type: 'string',
    format: 'date',
  })
  issueDate!: Date;

  @ApiProperty({
    description: 'Indicador de traslado SII',
    example: '1',
    enum: ['1', '2', '3', '4', '5'],
  })
  indTraslado!: string;

  @ApiProperty({
    description: 'Indica si la guía transporta precios en el DTE',
    example: true,
  })
  includePrices!: boolean;

  @ApiProperty({ type: DispatchGuideReceiverDto })
  receiver!: DispatchGuideReceiver;

  @ApiProperty({ type: DispatchGuideDestinationDto })
  destination!: DispatchGuideDestination;

  @ApiPropertyOptional({ type: DispatchGuideTransportDto, nullable: true })
  transport!: DispatchGuideTransport | null;

  @ApiProperty({ description: 'Subtotal en CLP' })
  subtotal!: number;

  @ApiProperty({ description: 'Descuento en CLP' })
  discount!: number;

  @ApiProperty({ description: 'Total neto en CLP' })
  netTotal!: number;

  @ApiProperty({ description: 'IVA en CLP' })
  taxTotal!: number;

  @ApiProperty({ description: 'Total en CLP' })
  total!: number;

  @ApiProperty({ description: 'Costo total en CLP' })
  cogsTotal!: number;

  @ApiPropertyOptional({
    description: 'Detalle del último error de emisión',
    nullable: true,
  })
  errorDetail!: string | null;

  @ApiProperty({
    description: 'Ítems de la guía',
    type: [DispatchGuideItemDto],
  })
  items!: DispatchGuideItemDto[];

  @ApiProperty({ description: 'Fecha de creación', type: Date })
  createdAt!: Date;

  @ApiProperty({ description: 'Fecha de actualización', type: Date })
  updatedAt!: Date;
}

export class DispatchGuideResponseDto {
  @ApiProperty({
    description: 'Guía de despacho persistida',
    type: DispatchGuideDto,
  })
  dispatchGuide!: DispatchGuideDto;

  @ApiPropertyOptional({
    description: 'Respuesta del DTE asociado',
    type: DteDocumentResponseDto,
    nullable: true,
  })
  dte?: DteDocumentResponseDto | null;

  @ApiProperty({
    description: 'Documentos que referencian esta guía',
    type: [DispatchGuideReferenceDto],
  })
  references!: DispatchGuideReferenceDto[];
}

export class DispatchGuideListMetaDto {
  @ApiProperty({ description: 'Página actual', example: 1 })
  page!: number;

  @ApiProperty({ description: 'Tamaño de página', example: 50 })
  limit!: number;

  @ApiProperty({ description: 'Total de guías', example: 12 })
  total!: number;
}

export class DispatchGuideListResponseDto {
  @ApiProperty({
    description: 'Guías de despacho',
    type: [DispatchGuideResponseDto],
  })
  dispatchGuides!: DispatchGuideResponseDto[];

  @ApiProperty({ type: DispatchGuideListMetaDto })
  meta!: DispatchGuideListMetaDto;
}
