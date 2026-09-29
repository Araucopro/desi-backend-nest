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

export type VariationUpsertAction = Exclude<
  VariationPlanAction,
  { kind: 'remove' }
>;

/**
 * Actualiza por SKU las variantes recibidas y crea las que todavía no existen.
 * Las variantes existentes que no vienen en el payload se conservan.
 */
export function buildVariationUpsertPlan(input: {
  variations: CreateProductVariationDto[];
  existing: ProductVariation[];
}): VariationUpsertAction[] {
  const existingBySku = new Map<string, ProductVariation>(
    input.existing.map((variation) => [variation.sku, variation]),
  );
  const actions: VariationUpsertAction[] = [];

  for (const dto of input.variations) {
    const existing = existingBySku.get(dto.sku);
    if (existing) {
      actions.push({ kind: 'update', dto, variation: existing });
      existingBySku.delete(dto.sku);
    } else {
      actions.push({ kind: 'create', dto });
    }
  }

  return actions;
}

/**
 * Compara las variaciones recibidas con las existentes y devuelve el plan de
 * creación, actualización y eliminación por SKU.
 */
export function buildVariationPlan(input: {
  variations: CreateProductVariationDto[];
  existing: ProductVariation[];
}): VariationPlanAction[] {
  const actions: VariationPlanAction[] = buildVariationUpsertPlan(input);
  const receivedSkus = new Set(
    input.variations.map((variation) => variation.sku),
  );

  for (const variation of input.existing) {
    if (!receivedSkus.has(variation.sku)) {
      actions.push({ kind: 'remove', variation });
    }
  }

  return actions;
}
