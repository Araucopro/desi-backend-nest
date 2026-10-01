import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
} from 'class-validator';
import {
  DteFmaPago,
  DtePaymentMedium,
} from '../../dte/entities/dte-document.entity';

export class InvoiceDispatchGuidesDto {
  @ApiPropertyOptional({
    description:
      'IDs de guías de despacho adicionales a consolidar en la misma factura (opcional)',
    type: [String],
    example: ['e2c94317-0a2d-4dd6-8b33-e02ff3cf3123'],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  additionalDispatchGuideIDs?: string[];

  @ApiProperty({
    description:
      'Código FmaPago de Openfactura: 1 contado, 2 crédito pendiente, 3 sin costo',
    enum: DteFmaPago,
    example: DteFmaPago.CONTADO,
  })
  @IsEnum(DteFmaPago)
  fmaPago!: DteFmaPago;

  @ApiProperty({
    description:
      'Medio de pago: 1 efectivo, 2 electrónico, 3 transferencia, 4 cheque, 5 otro',
    enum: DtePaymentMedium,
    example: DtePaymentMedium.BANK_TRANSFER,
  })
  @Type(() => Number)
  @IsInt()
  @IsIn(
    Object.values(DtePaymentMedium).filter(
      (value) => typeof value === 'number',
    ),
  )
  medioPago!: DtePaymentMedium;

  @ApiPropertyOptional({
    description:
      'Fecha de emisión de la factura (ISO YYYY-MM-DD). Por defecto: hoy',
    example: '2026-09-08',
  })
  @IsOptional()
  @IsDateString()
  issueDate?: string;
}
