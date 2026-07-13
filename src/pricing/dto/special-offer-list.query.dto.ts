import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class SpecialOfferListQueryDto {
  @ApiPropertyOptional({
    description: 'Filtra las ofertas por producto de tienda',
  })
  @IsOptional()
  @IsUUID()
  storeProductID?: string;
}
