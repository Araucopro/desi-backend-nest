import { ApiProperty } from '@nestjs/swagger';

export class CommerceContextResponseDto {
  @ApiProperty({ description: 'Acepta shipping.cost y conserva payment.amount como total de productos mas despacho' })
  supportsShipping!: boolean;
  @ApiProperty({ format: 'uuid' }) tenantID!: string;
  @ApiProperty({ format: 'uuid' }) storeID!: string;
  @ApiProperty() storeName!: string;
  @ApiProperty({ format: 'uuid' }) channelID!: string;
  @ApiProperty() channelCode!: string;
  @ApiProperty() channelName!: string;
  @ApiProperty({ type: String, nullable: true }) domain!: string | null;
  @ApiProperty() salesEnabled!: boolean;
  @ApiProperty() acceptTestPayments!: boolean;
  @ApiProperty() requireProductPhoto!: boolean;
}
