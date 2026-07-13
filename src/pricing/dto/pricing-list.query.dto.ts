import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class PricingListQueryDto {
  @ApiPropertyOptional({
    description: 'Filtra por producto de tienda específico',
  })
  @IsOptional()
  @IsUUID()
  storeProductID?: string;

  @ApiPropertyOptional({
    description: 'Filtra por tienda',
  })
  @IsOptional()
  @IsUUID()
  storeID?: string;

  @ApiPropertyOptional({
    description: 'Filtra por variación de producto',
  })
  @IsOptional()
  @IsUUID()
  variationID?: string;
}
