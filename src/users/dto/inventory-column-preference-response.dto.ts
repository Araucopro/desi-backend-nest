import { ApiProperty } from '@nestjs/swagger';

export class InventoryColumnPreferenceResponseDto {
  @ApiProperty({
    description:
      'Indica si existe una preferencia persistida para el contexto.',
    example: true,
  })
  exists!: boolean;

  @ApiProperty({
    description: 'Claves de interfaz que deben ocultarse.',
    type: [String],
    example: ['supplierSku', 'ean'],
  })
  hiddenColumns!: string[];

  @ApiProperty({
    description: 'Fecha de la última escritura, o null si aún no existe.',
    type: String,
    format: 'date-time',
    nullable: true,
    example: '2026-10-02T15:30:00.000Z',
  })
  updatedAt!: Date | null;
}
