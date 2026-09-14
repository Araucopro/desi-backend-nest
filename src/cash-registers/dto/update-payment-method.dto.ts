import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethodType } from '../entities/payment-method.entity';

export class UpdatePaymentMethodDto {
  @ApiPropertyOptional({
    description: 'Nombre visible del medio de pago',
    example: 'Efectivo',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({
    description:
      'Tipo contable del medio de pago. Al cambiarlo se recalcula affectsCash salvo que se envíe explícitamente.',
    enum: PaymentMethodType,
  })
  @IsOptional()
  @IsEnum(PaymentMethodType)
  type?: PaymentMethodType;

  @ApiPropertyOptional({
    description:
      'Si el medio mueve efectivo físico de la caja. Solo puede ser true para el tipo CASH.',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  affectsCash?: boolean;

  @ApiPropertyOptional({
    description: 'Si el medio de pago está disponible para cobrar',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
