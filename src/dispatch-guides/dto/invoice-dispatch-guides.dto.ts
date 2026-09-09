import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsUUID,
} from 'class-validator';
import { DteDocumentPaymentType } from '../../dte/entities/dte-document.entity';

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
    description: 'Tipo de pago de la factura electrónica',
    enum: DteDocumentPaymentType,
    example: DteDocumentPaymentType.CASH,
  })
  @IsEnum(DteDocumentPaymentType)
  paymentType!: DteDocumentPaymentType;

  @ApiPropertyOptional({
    description:
      'Fecha de emisión de la factura (ISO YYYY-MM-DD). Por defecto: hoy',
    example: '2026-09-08',
  })
  @IsOptional()
  @IsDateString()
  issueDate?: string;
}
