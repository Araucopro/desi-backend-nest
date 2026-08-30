import { CreateProductVariationDto } from './dto/create-product-variation.dto';
import { ProductVariation } from './entities/product-variation.entity';

export type VariationPlanAction =
  | { kind: 'create'; dto: CreateProductVariationDto }
  | {
      kind: 'update';
      dto: CreateProductVariationDto;
      variation: ProductVariation;
    }
  | { kind: 'remove'; variation: ProductVariation };

/**
 * Compara las variaciones recibidas con las existentes y devuelve el plan de
 * creación, actualización y eliminación por SKU.
 */
export function buildVariationPlan(input: {
  variations: CreateProductVariationDto[];
  existing: ProductVariation[];
}): VariationPlanAction[] {
  const existingBySku = new Map<string, ProductVariation>(
    input.existing.map((variation) => [variation.sku, variation]),
  );
  const actions: VariationPlanAction[] = [];

  for (const dto of input.variations) {
    const existing = existingBySku.get(dto.sku);
    if (existing) {
      actions.push({ kind: 'update', dto, variation: existing });
      existingBySku.delete(dto.sku);
    } else {
      actions.push({ kind: 'create', dto });
    }
  }

  for (const variation of existingBySku.values()) {
    actions.push({ kind: 'remove', variation });
  }

  return actions;
}
