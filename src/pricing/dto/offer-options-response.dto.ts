import { ApiProperty } from '@nestjs/swagger';
import { OfferSalesChannel } from '../entities/special-offer.entity';
export class OfferStoreOptionDto {
  @ApiProperty() storeID!: string;
  @ApiProperty() name!: string;
  @ApiProperty() onlineEnabled!: boolean;
}
export class OfferOptionsResponseDto {
  @ApiProperty({ type: [OfferStoreOptionDto] }) stores!: OfferStoreOptionDto[];
  @ApiProperty({ enum: OfferSalesChannel, isArray: true })
  salesChannels!: OfferSalesChannel[];
}
