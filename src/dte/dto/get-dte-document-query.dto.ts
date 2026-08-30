import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

export enum DteDocumentValue {
  JSON = 'json',
  PDF = 'pdf',
  XML = 'xml',
  STATUS = 'status',
  CEDIBLE = 'cedible',
}

export class GetDteDocumentQueryDto {
  @ApiPropertyOptional({
    description:
      'Valor a consultar/descargar del documento emitido: json, pdf, xml, status o cedible. Si se omite, se usa json. pdf/xml/cedible llegan en base64.',
    enum: DteDocumentValue,
    default: DteDocumentValue.JSON,
    example: DteDocumentValue.PDF,
  })
  @IsOptional()
  @IsEnum(DteDocumentValue)
  value?: DteDocumentValue;
}
