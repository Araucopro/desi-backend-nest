import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Cobro informado al crear una venta desde el POS.
 *
 * La suma de los montos debe igualar el total de la venta (Regla 3) y cada
 * pago exige un `PaymentMethod` activo del tenant.
 */
export class SalePaymentInputDto {
  @ApiProperty({
    description: 'ID del medio de pago (PaymentMethod)',
    example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  })
  @IsUUID()
  paymentMethodID!: string;

  @ApiProperty({
    description:
      'Monto cobrado con este medio (> 0, hasta 2 decimales). La suma de todos los pagos debe igualar el total de la venta.',
    example: 15980,
    minimum: 0.01,
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount!: number;

  @ApiPropertyOptional({
    description: 'Código de autorización de la terminal o pasarela',
    example: 'AUTH-123456',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  authorizationCode?: string;

  @ApiPropertyOptional({
    description: 'ID de transacción de la terminal o pasarela',
    example: 'TRX-987654',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  transactionID?: string;

  @ApiPropertyOptional({
    description: 'Referencia libre (número de voucher u operación)',
    example: 'VOUCHER-001',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reference?: string;
}
