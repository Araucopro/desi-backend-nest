import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEmail,
  IsEnum,
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
import { SalePaymentType, SaleType } from '../entities/sale.entity';
import { IsRut } from '../../common/validators/rut.validator';

export class CreateSaleReceiverDto {
  @ApiPropertyOptional({
    description: 'RUT del receptor (obligatorio para factura)',
    example: '66666666-6',
  })
  @IsOptional()
  @IsString()
  @IsRut()
  rut?: string;

  @ApiPropertyOptional({
    description: 'Nombre o razón social del receptor',
    example: 'Cliente Ejemplo SpA',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional({
    description: 'Correo del receptor',
    example: 'cliente@correo.cl',
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    description: 'Dirección del receptor',
    example: 'Av. Providencia 1234',
  })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({
    description: 'Comuna o ciudad del receptor',
    example: 'Providencia',
  })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({
    description: 'Giro del receptor',
    example: 'VENTA AL POR MENOR',
  })
  @IsOptional()
  @IsString()
  giro?: string;
}

export class CreateSaleItemDto {
  @ApiProperty({
    description: 'ID del producto en tienda (StoreProduct)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  storeProductID!: string;

  @ApiProperty({
    description: 'Cantidad de unidades',
    example: 1,
    minimum: 1,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;
}

export class CreateSaleDto {
  @ApiProperty({
    description: 'Tipo de venta',
    enum: SaleType,
    example: SaleType.NOTA_VENTA,
  })
  @IsEnum(SaleType)
  saleType!: SaleType;

  @ApiProperty({
    description: 'Forma de pago',
    enum: SalePaymentType,
    example: SalePaymentType.CASH,
  })
  @IsEnum(SalePaymentType)
  paymentType!: SalePaymentType;

  @ApiPropertyOptional({
    description: 'Fecha de emisión (ISO). Default: hoy',
    example: '2026-08-06',
  })
  @IsOptional()
  @IsDateString()
  issueDate?: string;

  @ApiPropertyOptional({
    description: 'Datos del receptor (obligatorio para factura)',
    type: CreateSaleReceiverDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateSaleReceiverDto)
  receiver?: CreateSaleReceiverDto;

  @ApiProperty({
    description: 'Ítems de la venta',
    type: [CreateSaleItemDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSaleItemDto)
  items!: CreateSaleItemDto[];

  @ApiPropertyOptional({
    description: 'Descuento manual porcentual (0-100)',
    example: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  manualDiscount?: number;
}
