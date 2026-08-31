import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsRut } from '../../common/validators/rut.validator';

export class CreateDispatchGuideReceiverDto {
  @ApiProperty({
    description: 'RUT del receptor',
    example: '76123456-7',
  })
  @IsString()
  @IsRut()
  rut!: string;

  @ApiProperty({
    description: 'Nombre o razón social del receptor',
    example: 'Cliente Ejemplo SpA',
  })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({
    description: 'Dirección del receptor',
    example: 'Av. Providencia 1234',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  address?: string;

  @ApiPropertyOptional({
    description: 'Comuna o ciudad del receptor',
    example: 'Providencia',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  city?: string;

  @ApiPropertyOptional({
    description: 'Giro del receptor',
    example: 'VENTA AL POR MENOR',
  })
  @IsOptional()
  @IsString()
  giro?: string;

  @ApiPropertyOptional({
    description: 'Correo del receptor',
    example: 'cliente@correo.cl',
  })
  @IsOptional()
  @IsEmail()
  email?: string;
}

export class CreateDispatchGuideDestinationDto {
  @ApiProperty({
    description: 'Dirección de destino de la mercadería',
    example: 'Av. Providencia 1234',
  })
  @IsString()
  @IsNotEmpty()
  address!: string;

  @ApiProperty({
    description: 'Comuna o ciudad de destino',
    example: 'Providencia',
  })
  @IsString()
  @IsNotEmpty()
  city!: string;
}

export class CreateDispatchGuideTransportDto {
  @ApiPropertyOptional({
    description: 'Patente del vehículo',
    example: 'AAAA11',
  })
  @IsOptional()
  @IsString()
  patente?: string;

  @ApiPropertyOptional({
    description: 'RUT del conductor',
    example: '76123456-7',
  })
  @IsOptional()
  @IsRut()
  rutConductor?: string;

  @ApiPropertyOptional({
    description: 'Nombre del conductor',
    example: 'Juan Pérez',
  })
  @IsOptional()
  @IsString()
  nombreConductor?: string;

  @ApiPropertyOptional({
    description: 'Fecha de traslado (ISO)',
    example: '2026-08-25',
  })
  @IsOptional()
  @IsDateString()
  fechaTraslado?: string;
}

export class CreateDispatchGuideItemDto {
  @ApiProperty({
    description: 'ID del producto en tienda (StoreProduct)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  storeProductID!: string;

  @ApiProperty({
    description: 'Cantidad de unidades',
    example: 2,
    minimum: 1,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;
}

export class CreateDispatchGuideDto {
  @ApiProperty({
    description: 'Ítems de la guía',
    type: [CreateDispatchGuideItemDto],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateDispatchGuideItemDto)
  items!: CreateDispatchGuideItemDto[];

  @ApiPropertyOptional({
    description: 'ID opcional del cliente registrado',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsUUID()
  clientID?: string;

  @ApiProperty({
    description: 'Datos del receptor',
    type: CreateDispatchGuideReceiverDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateDispatchGuideReceiverDto)
  receiver?: CreateDispatchGuideReceiverDto;

  @ApiProperty({
    description: 'Destino de la mercadería',
    type: CreateDispatchGuideDestinationDto,
  })
  @ValidateNested()
  @Type(() => CreateDispatchGuideDestinationDto)
  destination!: CreateDispatchGuideDestinationDto;

  @ApiPropertyOptional({
    description: 'Fecha de emisión (ISO). Default: hoy',
    example: '2026-08-25',
  })
  @IsOptional()
  @IsDateString()
  issueDate?: string;

  @ApiPropertyOptional({
    description:
      'Descuento manual porcentual (0-100). Se valida contra el rol del usuario, su pertenencia a la tienda y el margen mínimo',
    example: 10,
    minimum: 0,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  manualDiscount?: number;

  @ApiPropertyOptional({
    description: 'Datos de transporte (opcionales en v1)',
    type: CreateDispatchGuideTransportDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateDispatchGuideTransportDto)
  transport?: CreateDispatchGuideTransportDto;

  @ApiPropertyOptional({
    description:
      'Indicador de traslado SII: 1 venta, 2 venta por encargo, 3 consignación, 4 entrega gratuita, 5 traslados internos',
    example: '1',
    enum: ['1', '2', '3', '4', '5'],
    default: '1',
  })
  @IsOptional()
  @IsIn(['1', '2', '3', '4', '5'])
  indTraslado?: '1' | '2' | '3' | '4' | '5' = '1';

  @ApiPropertyOptional({
    description:
      'Si false, la guía se emite sin precios (montos en cero) y omite PricingService',
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  includePrices?: boolean = true;
}
