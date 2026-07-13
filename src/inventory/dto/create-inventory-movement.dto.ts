import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { InventoryMovementReason } from '../entities/inventory-movement.entity';

export class CreateInventoryMovementDto {
  @ApiProperty({
    description: 'ID de la tienda donde se realiza el movimiento',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  @IsNotEmpty()
  storeID!: string;

  @ApiProperty({
    description: 'ID de la variante del producto',
    example: 'd8c7e96b-8d74-4b4e-9d8a-987654321012',
  })
  @IsUUID()
  @IsNotEmpty()
  variationID!: string;

  @ApiProperty({
    description:
      'Cantidad involucrada en el movimiento (Obligatorio para VENTA, COMPRA, TRANSFERENCIA)',
    example: 5,
    required: false,
  })
  @IsInt()
  @IsOptional()
  quantity?: number;

  @ApiProperty({
    description: 'Nuevo valor de stock (Obligatorio si el motivo es AJUSTE)',
    example: 100,
    required: false,
  })
  @IsInt()
  @IsOptional()
  newStock?: number;

  @ApiProperty({
    description: 'Motivo del movimiento',
    enum: InventoryMovementReason,
    example: InventoryMovementReason.ADJUSTMENT,
  })
  @IsEnum(InventoryMovementReason)
  @IsNotEmpty()
  reason!: InventoryMovementReason;

  @ApiProperty({
    description: 'ID de referencia opcional (ej. ID de venta o pedido)',
    example: 'REF-12345',
    required: false,
  })
  @IsString()
  @IsOptional()
  referenceID?: string;
}
