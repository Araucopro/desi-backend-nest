import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class PurchaseOrderItemDto {
  @ApiProperty({
    description: 'ID de la variación solicitada',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  @IsNotEmpty()
  variationID!: string;

  @ApiProperty({ description: 'Cantidad solicitada', example: 2, minimum: 1 })
  @IsInt()
  @IsPositive()
  quantity!: number;

  @ApiProperty({
    description: 'Precio neto unitario pactado en la OC',
    example: 37000,
    minimum: 0,
  })
  @IsNumber()
  @IsPositive()
  unitPrice!: number;
}

export class CreatePurchaseOrderDto {
  @ApiProperty({
    description: 'Tienda a la que se envía la OC',
    example: '123e4567-e89b-12d3-a456-426614174111',
  })
  @IsUUID()
  @IsNotEmpty()
  storeID!: string;

  @ApiProperty({
    description: 'Indica si la OC es para un tercero',
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  isThirdParty?: boolean;

  @ApiProperty({
    description: 'Fecha de vencimiento de pago',
    example: '2025-11-30',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiProperty({
    description: 'Número de DTE asociado',
    example: '123456789',
    required: false,
  })
  @IsOptional()
  dteNumber?: string;

  @ApiProperty({
    description: 'Descuento total en pesos',
    example: 0,
    default: 0,
  })
  @IsOptional()
  @IsNumber()
  discount?: number;

  @ApiProperty({
    type: [PurchaseOrderItemDto],
    description: 'Detalle de productos solicitados',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderItemDto)
  items!: PurchaseOrderItemDto[];
}
