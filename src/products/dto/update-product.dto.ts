import { PartialType } from '@nestjs/swagger';
import { ApiProperty } from '@nestjs/swagger';
import { CreateProductDto } from './create-product.dto';
import { CreateProductVariationDto } from './create-product-variation.dto';

export class UpdateProductDto extends PartialType(CreateProductDto) {
  @ApiProperty({
    description:
      'Arreglo COMPLETO de variantes (upsert por SKU): las variantes presentes se crean o actualizan, y las variantes existentes que NO estén en el arreglo se eliminan junto con su StoreProduct. Para conservar una variante existente debe enviarse con su SKU, priceCost, priceList y stock actuales.',
    type: [CreateProductVariationDto],
    required: false,
  })
  variations?: CreateProductVariationDto[];
}
