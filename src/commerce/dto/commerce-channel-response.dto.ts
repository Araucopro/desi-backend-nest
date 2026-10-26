import { ApiProperty } from '@nestjs/swagger';

export class CommerceChannelResponseDto {
  @ApiProperty({ format: 'uuid' }) channelID!: string;
  @ApiProperty({ format: 'uuid' }) tenantID!: string;
  @ApiProperty({ format: 'uuid' }) storeID!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: String, nullable: true }) domain!: string | null;
  @ApiProperty() active!: boolean;
  @ApiProperty() salesEnabled!: boolean;
  @ApiProperty() acceptTestPayments!: boolean;
  @ApiProperty({
    default: true,
    description:
      'Exigir foto para publicar y cotizar. Descripcion y slug son opcionales; la compra requiere precio y stock validos.',
  })
  requireProductPhoto!: boolean;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ format: 'date-time' }) updatedAt!: Date;
}

export class CommerceChannelWithTokenResponseDto extends CommerceChannelResponseDto {
  @ApiProperty({
    description:
      'Token privado emitido una sola vez; no se incluye en listados ni actualizaciones.',
  })
  token!: string;
}
