import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

class VerifyItemDto {
  @ApiProperty({
    description: 'Variación escaneada',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  @IsNotEmpty()
  variationID!: string;

  @ApiProperty({
    description: 'Cantidad recibida/escaneada',
    example: 1,
    minimum: 1,
  })
  @IsInt()
  @IsPositive()
  quantityReceived!: number;

  @ApiProperty({
    description: 'Precio neto unitario usado al ajustar la OC',
    required: false,
    example: 37000,
  })
  @IsOptional()
  @IsNumber()
  unitPrice?: number;
}

export class VerifyPurchaseOrderDto {
  @ApiProperty({
    type: [VerifyItemDto],
    description: 'Detalle de escaneos para validar la recepción de la orden',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VerifyItemDto)
  items!: VerifyItemDto[];
}
