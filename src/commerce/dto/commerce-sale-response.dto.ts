import { ApiProperty } from '@nestjs/swagger';
import { SaleResponseDto } from '../../sales/dto/sale-response.dto';
import {
  CommercePaymentDto,
  CommerceShippingDto,
} from './create-commerce-sale.dto';

export class CommerceCustomerDetailsDto {
  @ApiProperty({ type: String, nullable: true }) phone!: string | null;
  @ApiProperty({ type: CommerceShippingDto, nullable: true })
  shipping!: CommerceShippingDto | null;
  @ApiProperty({ type: String, nullable: true }) notes!: string | null;
}

export class CommerceSaleResponseDto extends SaleResponseDto {
  @ApiProperty({ format: 'uuid' }) commerceOrderID!: string;
  @ApiProperty() externalOrderID!: string;
  @ApiProperty({ format: 'uuid' }) tenantID!: string;
  @ApiProperty({ format: 'uuid' }) storeID!: string;
  @ApiProperty({ format: 'uuid' }) channelID!: string;
  @ApiProperty({ format: 'uuid' }) saleID!: string;
  @ApiProperty({ type: CommercePaymentDto }) payment!: CommercePaymentDto;
  @ApiProperty({ type: CommerceCustomerDetailsDto })
  customerDetails!: CommerceCustomerDetailsDto;
}
