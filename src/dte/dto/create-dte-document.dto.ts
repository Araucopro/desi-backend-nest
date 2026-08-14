import { Type, TypeHelpOptions } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsDefined,
  IsEnum,
  IsInt,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import {
  ApiExtraModels,
  ApiProperty,
  ApiPropertyOptional,
  getSchemaPath,
} from '@nestjs/swagger';

export enum DteResponseValue {
  TOKEN = 'TOKEN',
  FOLIO = 'FOLIO',
  STATUS = 'STATUS',
  PDF = 'PDF',
  XML = 'XML',
}

export class DteIdDocBoletaDto {
  @ApiProperty({ description: 'Tipo de DTE', example: 39 })
  @Type(() => Number)
  @IsInt()
  @IsIn([39])
  TipoDTE!: 39;

  @ApiPropertyOptional({ description: 'Folio del documento', example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  Folio?: number;

  @ApiProperty({ description: 'Fecha de emisión', example: '2026-08-03' })
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
}

export class DteIdDocFacturaDto {
  @ApiProperty({ description: 'Tipo de DTE', example: 33 })
  @Type(() => Number)
  @IsInt()
  @IsIn([33])
  TipoDTE!: 33;

  @ApiPropertyOptional({ description: 'Folio del documento', example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  Folio?: number;

  @ApiProperty({ description: 'Fecha de emisión', example: '2026-08-03' })
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

export class DteEmisorBoletaDto {
  @ApiProperty({ description: 'RUT del emisor', example: '76795561-8' })
  @IsString()
  @IsNotEmpty()
  RUTEmisor!: string;

  @ApiProperty({
    description: 'Razón social del emisor (Boleta)',
    example: 'HAULMER SPA',
  })
  @IsString()
  @IsNotEmpty()
  RznSocEmisor!: string;

  @ApiPropertyOptional({
    description: 'Giro comercial del emisor (Boleta)',
    example: 'VENTA AL POR MENOR POR CORREO, POR INTERNET Y VIA TELEFONICA',
  })
  @IsOptional()
  @IsString()
  GiroEmisor?: string;

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

export class DteEmisorFacturaDto {
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

  @ApiPropertyOptional({ description: 'Comuna receptor', example: 'Temuco' })
  @IsOptional()
  @IsString()
  CmnaRecep?: string;
}

class DteTotalesDto {
  @ApiPropertyOptional({ description: 'Monto neto', example: 21008 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  MntNeto?: number;

  @ApiPropertyOptional({ description: 'Tasa IVA', example: '19' })
  @IsOptional()
  @IsString()
  TasaIVA?: string;

  @ApiPropertyOptional({ description: 'IVA', example: 3992 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  IVA?: number;

  @ApiPropertyOptional({ description: 'Monto total', example: 25000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  MntTotal?: number;

  @ApiPropertyOptional({ description: 'Monto del período', example: 25000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  MontoPeriodo?: number;

  @ApiPropertyOptional({ description: 'Valor a pagar', example: 25000 })
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
    example: '10001',
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
    example: 'Producto Demo',
  })
  @IsString()
  @IsNotEmpty()
  NmbItem!: string;

  @ApiProperty({ description: 'Cantidad', example: 1 })
  @Type(() => Number)
  @IsNumber()
  QtyItem!: number;

  @ApiPropertyOptional({ description: 'Precio unitario NETO', example: 21008 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  PrcItem?: number;

  @ApiPropertyOptional({ description: 'Monto del ítem NETO', example: 21008 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  MontoItem?: number;

  @ApiPropertyOptional({ type: DteCodigoItemDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DteCodigoItemDto)
  CdgItem?: DteCodigoItemDto;
}

export class BoletaEncabezadoDto {
  @ApiProperty({ type: DteIdDocBoletaDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => DteIdDocBoletaDto)
  IdDoc!: DteIdDocBoletaDto;

  @ApiPropertyOptional({ type: DteEmisorBoletaDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DteEmisorBoletaDto)
  Emisor?: DteEmisorBoletaDto;

  @ApiProperty({ type: DteReceptorDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => DteReceptorDto)
  Receptor!: DteReceptorDto;

  @ApiPropertyOptional({ type: DteTotalesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DteTotalesDto)
  Totales?: DteTotalesDto;
}

export class FacturaEncabezadoDto {
  @ApiProperty({ type: DteIdDocFacturaDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => DteIdDocFacturaDto)
  IdDoc!: DteIdDocFacturaDto;

  @ApiPropertyOptional({ type: DteEmisorFacturaDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DteEmisorFacturaDto)
  Emisor?: DteEmisorFacturaDto;

  @ApiProperty({ type: DteReceptorDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => DteReceptorDto)
  Receptor!: DteReceptorDto;

  @ApiPropertyOptional({ type: DteTotalesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DteTotalesDto)
  Totales?: DteTotalesDto;
}

export type DteEncabezadoDto = BoletaEncabezadoDto | FacturaEncabezadoDto;

@ApiExtraModels(BoletaEncabezadoDto, FacturaEncabezadoDto)
export class DteDto {
  @ApiProperty({
    oneOf: [
      { $ref: getSchemaPath(BoletaEncabezadoDto) },
      { $ref: getSchemaPath(FacturaEncabezadoDto) },
    ],
  })
  @IsDefined()
  @ValidateNested()
  @Type((type?: TypeHelpOptions) => {
    const encabezado = (
      type?.object as
        | { Encabezado?: { IdDoc?: { TipoDTE?: unknown } } }
        | undefined
    )?.Encabezado;
    return Number(encabezado?.IdDoc?.TipoDTE) === 39
      ? BoletaEncabezadoDto
      : FacturaEncabezadoDto;
  })
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

export class CreateDteDocumentDto {
  @ApiPropertyOptional({
    description: 'ID de la orden de compra asociada, si aplica',
  })
  @IsOptional()
  @IsUUID()
  purchaseOrderID?: string;

  @ApiProperty({
    description: 'Campos de salida que solicita el cliente',
    isArray: true,
    enum: DteResponseValue,
    example: ['FOLIO', 'PDF', 'STATUS'],
  })
  @IsArray()
  @IsEnum(DteResponseValue, { each: true })
  response!: DteResponseValue[];

  @ApiProperty({ type: DteDto })
  @IsDefined()
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
}

export type DteDocumentInput = CreateDteDocumentDto;
