import { IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export enum ConvertDocumentType {
  BOLETA = 'BOLETA',
  FACTURA = 'FACTURA',
}

export class ConvertSaleDto {
  @ApiPropertyOptional({
    description:
      'Tipo de documento a emitir. Default: FACTURA si hay receptor, BOLETA en caso contrario',
    enum: ConvertDocumentType,
  })
  @IsOptional()
  @IsEnum(ConvertDocumentType)
  documentType?: ConvertDocumentType;
}
