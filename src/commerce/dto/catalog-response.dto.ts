import { ApiProperty } from '@nestjs/swagger';
import { DiscountType } from '../../pricing/entities/special-offer.entity';

export class CommercePromotionDto {
  @ApiProperty({ format: 'uuid' }) offerID!: string;
  @ApiProperty({ enum: DiscountType }) discountType!: DiscountType;
  @ApiProperty() label!: string;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ type: Number, nullable: true }) buyQuantity!: number | null;
  @ApiProperty({ type: Number, nullable: true }) payQuantity!: number | null;
}

export class CommerceCatalogVariantDto {
  @ApiProperty({
    type: [CommercePromotionDto],
    description:
      'Promociones elegibles de esta variante para el canal online. El precio final depende del carrito.',
  })
  promotions!: CommercePromotionDto[];
  @ApiProperty({ format: 'uuid' }) variationID!: string;
  @ApiProperty({ format: 'uuid' }) storeProductID!: string;
  @ApiProperty() sku!: string;
  @ApiProperty({ type: String, nullable: true }) size!: string | null;
  @ApiProperty({ type: String, nullable: true }) color!: string | null;
  @ApiProperty({ minimum: 0 }) stock!: number;
  @ApiProperty({ type: Number, nullable: true }) price!: number | null;
  @ApiProperty({ type: Number, nullable: true }) compareAtPrice!: number | null;
}

export class CommerceCatalogProductDto {
  @ApiProperty({ format: 'uuid' }) productID!: string;
  @ApiProperty({
    description:
      'Slug del ERP o producto-{productID} cuando falta. No modifica el producto guardado.',
  })
  slug!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: String, nullable: true }) brand!: string | null;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({
    description:
      'Up to five comma-separated HTTP/HTTPS photo URLs, cover first. Empty when the channel allows products without photos.',
  })
  image!: string;
  @ApiProperty({ type: String, nullable: true }) category!: string | null;
  @ApiProperty({ type: [CommerceCatalogVariantDto] })
  variants!: CommerceCatalogVariantDto[];
}

export class CommerceQuotedItemDto {
  @ApiProperty() baseUnitPrice!: number;
  @ApiProperty({ minimum: 0 }) discount!: number;
  @ApiProperty({
    type: [CommercePromotionDto],
    description: 'Promociones efectivamente aplicadas a esta línea.',
  })
  promotions!: CommercePromotionDto[];
  @ApiProperty({ format: 'uuid' }) storeProductID!: string;
  @ApiProperty() sku!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: String, nullable: true }) image!: string | null;
  @ApiProperty({ type: String, nullable: true }) size!: string | null;
  @ApiProperty({ type: String, nullable: true }) color!: string | null;
  @ApiProperty() quantity!: number;
  @ApiProperty() unitPrice!: number;
  @ApiProperty() lineTotal!: number;
  @ApiProperty() available!: boolean;
}

export class CommerceQuoteTotalsDto {
  @ApiProperty() subtotal!: number;
  @ApiProperty() discount!: number;
  @ApiProperty() total!: number;
}

export class CommerceQuoteResponseDto {
  @ApiProperty({ type: [CommerceQuotedItemDto] })
  items!: CommerceQuotedItemDto[];
  @ApiProperty({ type: CommerceQuoteTotalsDto })
  totals!: CommerceQuoteTotalsDto;
  @ApiProperty({ format: 'date-time' }) quotedAt!: string;
}
