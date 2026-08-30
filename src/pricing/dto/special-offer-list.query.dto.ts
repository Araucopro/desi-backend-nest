import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { OfferTargetScope } from '../entities/special-offer.entity';

export class SpecialOfferListQueryDto {
  @ApiPropertyOptional({
    description: 'Filtra las ofertas por producto de tienda',
  })
  @IsOptional()
  @IsUUID()
  storeProductID?: string;

  @ApiPropertyOptional({
    description: 'Filtra las ofertas por tienda',
  })
  @IsOptional()
  @IsUUID()
  storeID?: string;

  @ApiPropertyOptional({
    description: 'Filtra las ofertas por alcance',
    enum: OfferTargetScope,
  })
  @IsOptional()
  @IsEnum(OfferTargetScope)
  targetScope?: OfferTargetScope;

  @ApiPropertyOptional({
    description: 'Filtra las ofertas por producto incluido',
  })
  @IsOptional()
  @IsUUID()
  productID?: string;

  @ApiPropertyOptional({
    description: 'Filtra las ofertas por categoría',
  })
  @IsOptional()
  @IsUUID()
  categoryID?: string;

  @ApiPropertyOptional({
    description: 'Filtra las ofertas por marca',
  })
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiPropertyOptional({
    description: 'Filtra por ofertas activas o inactivas',
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;
}
