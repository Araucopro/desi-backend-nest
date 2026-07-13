import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import type { PurchaseOrderStatus } from '../entities/purchase-order.entity';
import { PurchaseOrderItemDto } from './create-purchase-order.dto';

export class UpdatePurchaseOrderDto {
  @ApiProperty({
    description: 'Estado del pago de la OC',
    enum: ['Pagado', 'Pendiente', 'Anulado'],
    required: false,
  })
  @IsOptional()
  @IsEnum(['Pagado', 'Pendiente', 'Anulado'])
  paymentStatus?: PurchaseOrderStatus;

  @ApiProperty({
    description: 'Fecha de vencimiento',
    example: '2025-11-30',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiProperty({
    description: 'Número de DTE',
    example: '112233',
    required: false,
  })
  @IsOptional()
  dteNumber?: string;

  @ApiProperty({
    description: 'Descuento total en pesos',
    example: 5000,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  discount?: number;

  @ApiProperty({
    description: 'Marcar la OC como para un tercero',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isThirdParty?: boolean;

  @ApiProperty({
    description: 'Permite cambiar la tienda destino',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  storeID?: string;

  @ApiProperty({
    type: [PurchaseOrderItemDto],
    description: 'Actualización del detalle de productos',
    required: false,
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderItemDto)
  items?: PurchaseOrderItemDto[];
}
