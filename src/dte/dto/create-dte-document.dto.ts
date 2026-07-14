import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export enum DteResponseValue {
  TOKEN = 'TOKEN',
  FOLIO = 'FOLIO',
  STATUS = 'STATUS',
  PDF = 'PDF',
  XML = 'XML',
  SELF_SERVICE = 'SELF_SERVICE',
}

class DteIdDocDto {
  @ApiPropertyOptional({ description: 'Tipo de DTE', example: 33 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  TipoDTE?: number;

  @ApiPropertyOptional({ description: 'Folio del documento', example: 26005 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  Folio?: number;

  @ApiProperty({ description: 'Fecha de emisión', example: '2025-03-23' })
  @IsDateString()
  FchEmis!: string;

  @ApiPropertyOptional({
    description: 'Tipo de transacción compra',
    example: '1',
  })
  @IsOptional()
  @IsString()
  TpoTranCompra?: string;

  @ApiPropertyOptional({
    description: 'Tipo de transacción venta',
    example: '1',
  })
  @IsOptional()
  @IsString()
  TpoTranVenta?: string;

  @ApiPropertyOptional({ description: 'Forma de pago', example: '2' })
  @IsOptional()
  @IsString()
  FmaPago?: string;
}

class DteEmisorDto {
  @ApiProperty({ description: 'RUT del emisor', example: '76795561-8' })
  @IsString()
  @IsNotEmpty()
  RUTEmisor!: string;

  @ApiProperty({ description: 'Razón social', example: 'HAULMER SPA' })
  @IsString()
  @IsNotEmpty()
  RznSoc!: string;

  @ApiPropertyOptional({
    description: 'Giro comercial del emisor',
    example: 'VENTA AL POR MENOR POR CORREO, POR INTERNET Y VIA TELEFONICA',
  })
  @IsOptional()
  @IsString()
  GiroEmis?: string;

  @ApiPropertyOptional({
    description: 'Códigos de actividad',
    example: ['479100'],
  })
  @IsOptional()
  @IsArray()
  Acteco?: string[];

  @ApiPropertyOptional({
    description: 'Dirección origen',
    example: 'ARTURO PRAT 527 CURICO',
  })
  @IsOptional()
  @IsString()
  DirOrigen?: string;

  @ApiPropertyOptional({ description: 'Comuna de origen', example: 'Curicó' })
  @IsOptional()
  @IsString()
  CmnaOrigen?: string;

  @ApiPropertyOptional({ description: 'Teléfono', example: '0 0' })
  @IsOptional()
  @IsString()
  Telefono?: string;

  @ApiPropertyOptional({
    description: 'Código sucursal SII',
    example: '81303347',
  })
  @IsOptional()
  @IsString()
  CdgSIISucur?: string;
}

class DteReceptorDto {
  @ApiProperty({ description: 'RUT del receptor', example: '76430498-5' })
  @IsString()
  @IsNotEmpty()
  RUTRecep!: string;

  @ApiProperty({ description: 'Razón social receptor', example: 'HOSTY SPA' })
  @IsString()
  @IsNotEmpty()
  RznSocRecep!: string;

  @ApiPropertyOptional({
    description: 'Giro receptor',
    example: 'ACTIVIDADES DE CONSULTORIA DE INFORMATICA',
  })
  @IsOptional()
  @IsString()
  GiroRecep?: string;

  @ApiPropertyOptional({
    description: 'Dirección receptor',
    example: 'ARTURO PRAT 527 3 piso OF 1',
  })
  @IsOptional()
  @IsString()
  DirRecep?: string;

  @ApiPropertyOptional({ description: 'Comuna receptor', example: 'Curicó' })
  @IsOptional()
  @IsString()
  CmnaRecep?: string;
}

class DteTotalesDto {
  @ApiPropertyOptional({ description: 'Monto neto', example: 10600 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  MntNeto?: number;

  @ApiPropertyOptional({ description: 'Tasa IVA', example: '19' })
  @IsOptional()
  @IsString()
  TasaIVA?: string;

  @ApiPropertyOptional({ description: 'IVA', example: 2014 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  IVA?: number;

  @ApiPropertyOptional({ description: 'Monto total', example: 12614 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  MntTotal?: number;

  @ApiPropertyOptional({ description: 'Monto del período', example: 12614 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  MontoPeriodo?: number;

  @ApiPropertyOptional({ description: 'Valor a pagar', example: 12614 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  VlrPagar?: number;
}

class DteCodigoItemDto {
  @ApiPropertyOptional({ description: 'Tipo de código', example: 'INT1' })
  @IsOptional()
  @IsString()
  TpoCodigo?: string;

  @ApiPropertyOptional({
    description: 'Valor del código',
    example: '101122146100',
  })
  @IsOptional()
  @IsString()
  VlrCodigo?: string;
}

class DteDetalleItemDto {
  @ApiProperty({ description: 'Línea de detalle', example: 1 })
  @Type(() => Number)
  @IsInt()
  NroLinDet!: number;

  @ApiProperty({
    description: 'Nombre del ítem',
    example: 'Cama para Perros William',
  })
  @IsString()
  @IsNotEmpty()
  NmbItem!: string;

  @ApiProperty({ description: 'Cantidad', example: 1 })
  @Type(() => Number)
  @IsNumber()
  QtyItem!: number;

  @ApiPropertyOptional({ description: 'Precio unitario', example: 39990 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  PrcItem?: number;

  @ApiPropertyOptional({ description: 'Monto del ítem', example: 39990 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  MontoItem?: number;

  @ApiPropertyOptional({ description: 'Indica exento', example: '1' })
  @IsOptional()
  @IsString()
  IndExe?: string;

  @ApiPropertyOptional({ type: DteCodigoItemDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DteCodigoItemDto)
  CdgItem?: DteCodigoItemDto;
}

class DteEncabezadoDto {
  @ApiProperty({ type: DteIdDocDto })
  @ValidateNested()
  @Type(() => DteIdDocDto)
  IdDoc!: DteIdDocDto;

  @ApiProperty({ type: DteEmisorDto })
  @ValidateNested()
  @Type(() => DteEmisorDto)
  Emisor!: DteEmisorDto;

  @ApiProperty({ type: DteReceptorDto })
  @ValidateNested()
  @Type(() => DteReceptorDto)
  Receptor!: DteReceptorDto;

  @ApiPropertyOptional({ type: DteTotalesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DteTotalesDto)
  Totales?: DteTotalesDto;
}

class DteDto {
  @ApiProperty({ type: DteEncabezadoDto })
  @ValidateNested()
  @Type(() => DteEncabezadoDto)
  Encabezado!: DteEncabezadoDto;

  @ApiProperty({ type: [DteDetalleItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DteDetalleItemDto)
  Detalle!: DteDetalleItemDto[];
}

class DteCustomerDto {
  @ApiPropertyOptional({
    description: 'Nombre completo',
    example: 'Cliente Ejemplo',
  })
  @IsOptional()
  @IsString()
  fullName?: string;

  @ApiPropertyOptional({
    description: 'Correo electrónico',
    example: 'cliente@correo.com',
  })
  @IsOptional()
  @IsString()
  email?: string;
}

class DteExternalReferenceDto {
  @ApiPropertyOptional({
    description: 'Texto del enlace',
    example: 'Orden de Compra #7788489532',
  })
  @IsOptional()
  @IsString()
  hyperlinkText?: string;

  @ApiPropertyOptional({
    description: 'URL del enlace',
    example: 'https://www.miurl.com/orden-de-compra/334',
  })
  @IsOptional()
  @IsString()
  hyperlinkURL?: string;
}

class DteCustomizePageDto {
  @ApiPropertyOptional({ type: DteExternalReferenceDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DteExternalReferenceDto)
  externalReference?: DteExternalReferenceDto;

  @ApiPropertyOptional({
    description: 'URL del logo personalizado',
    example: 'https://www.miurl.com/logo.jpg',
  })
  @IsOptional()
  @IsString()
  urlLogo?: string;
}

class DteDocumentReferenceDto {
  @ApiPropertyOptional({
    description: 'Tipo de documento referenciado',
    example: '801',
  })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({
    description: 'ID del documento referenciado',
    example: '334',
  })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiPropertyOptional({
    description: 'Fecha del documento referenciado',
    example: '2025-01-31',
  })
  @IsOptional()
  @IsDateString()
  date?: string;
}

class DteSelfServiceDto {
  @ApiProperty({ description: 'Emite boleta automáticamente', example: true })
  @IsBoolean()
  issueBoleta!: boolean;

  @ApiProperty({ description: 'Permite convertir a factura', example: true })
  @IsBoolean()
  allowFactura!: boolean;

  @ApiPropertyOptional({ type: DteDocumentReferenceDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DteDocumentReferenceDto)
  documentReference?: DteDocumentReferenceDto;
}

export class CreateDteDocumentDto {
  @ApiPropertyOptional({
    description: 'ID de la orden de compra aceptada que origina el DTE',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsOptional()
  @IsUUID()
  purchaseOrderID?: string;

  @ApiProperty({
    description: 'Campos de salida que solicita el cliente',
    isArray: true,
    enum: DteResponseValue,
    example: ['FOLIO', 'SELF_SERVICE'],
  })
  @IsArray()
  @IsEnum(DteResponseValue, { each: true })
  response!: DteResponseValue[];

  @ApiProperty({ type: DteDto })
  @ValidateNested()
  @Type(() => DteDto)
  dte!: DteDto;

  @ApiPropertyOptional({ type: DteCustomerDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DteCustomerDto)
  customer?: DteCustomerDto;

  @ApiPropertyOptional({ type: DteCustomizePageDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DteCustomizePageDto)
  customizePage?: DteCustomizePageDto;

  @ApiProperty({ type: DteSelfServiceDto })
  @ValidateNested()
  @Type(() => DteSelfServiceDto)
  selfService!: DteSelfServiceDto;
}

export type DteDocumentInput = CreateDteDocumentDto;
