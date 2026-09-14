import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethodType } from '../entities/payment-method.entity';

export class CreatePaymentMethodDto {
  @ApiProperty({
    description:
      'Código único del medio de pago en el tenant (se normaliza a mayúsculas)',
    example: 'CASH',
    maxLength: 50,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(50)
  code!: string;

  @ApiProperty({
    description: 'Nombre visible del medio de pago',
    example: 'Efectivo',
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @ApiProperty({
    description: 'Tipo contable del medio de pago',
    enum: PaymentMethodType,
    example: PaymentMethodType.CASH,
  })
  @IsEnum(PaymentMethodType)
  type!: PaymentMethodType;

  @ApiPropertyOptional({
    description:
      'Si el medio mueve efectivo físico de la caja. Solo puede ser true para el tipo CASH; si se omite se deriva del tipo.',
    example: true,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  affectsCash?: boolean;

  @ApiPropertyOptional({
    description: 'Si el medio de pago está disponible para cobrar',
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
