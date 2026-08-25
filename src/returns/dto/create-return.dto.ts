import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReturnType } from '../entities/return.entity';

export class CreateReturnItemDto {
  @ApiProperty({
    description: 'ID del ítem de la venta original',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  saleItemID!: string;

  @ApiProperty({
    description: 'Cantidad de unidades devueltas',
    example: 1,
    minimum: 1,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;
}

export class CreateReturnDto {
  @ApiProperty({
    description: 'ID de la venta original',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  saleID!: string;

  @ApiProperty({
    description: 'Tipo de devolución',
    enum: ReturnType,
    example: ReturnType.PARCIAL,
  })
  @IsEnum(ReturnType)
  returnType!: ReturnType;

  @ApiPropertyOptional({
    description:
      'Ítems devueltos (obligatorio en TOTAL/PARCIAL; prohibido en DESCUENTO)',
    type: [CreateReturnItemDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateReturnItemDto)
  items?: CreateReturnItemDto[];

  @ApiPropertyOptional({
    description: 'Monto del descuento posterior en CLP (solo DESCUENTO)',
    example: 5000,
    minimum: 0.01,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  discountAmount?: number;

  @ApiPropertyOptional({
    description:
      'Motivo de la devolución (obligatorio en DESCUENTO; opcional en ítems)',
    example: 'Devolución parcial de mercadería',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  reason?: string;

  @ApiPropertyOptional({
    description: 'Fecha de emisión de la devolución (ISO). Default: hoy',
    example: '2026-08-25',
  })
  @IsOptional()
  @IsDateString()
  issueDate?: string;
}
