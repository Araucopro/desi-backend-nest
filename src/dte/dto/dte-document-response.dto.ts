import { ApiProperty } from '@nestjs/swagger';

export class DteDocumentResponseDto {
  @ApiProperty({
    description: 'Token del documento generado',
    example: 'b822a58da11856bb09423a0a6fba59f5e089bd738e01d3ea670c45d4686f66d6',
  })
  TOKEN!: string;

  @ApiProperty({
    description: 'Folio del documento',
    example: 3130,
  })
  FOLIO!: number;

  @ApiProperty({
    description: 'Estado de emisión del documento',
    example: 'EMITIDO',
  })
  status!: string;
}
