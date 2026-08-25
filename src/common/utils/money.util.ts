export const TAX_RATE = 0.19;

/**
 * Redondea a CLP entero para la frontera tributaria (SII/Openfactura).
 * Los valores internos que requieren centavos (ej. cogs) no deben pasar por
 * aquí; usan toMoney() en sus respectivos engines.
 */
export function roundClp(value: number): number {
  return Math.round(value);
}

/**
 * Política total-first para documentos con IVA incluido:
 * el neto se deriva del total redondeado y el IVA es el residuo exacto.
 */
export function splitIvaIncluded(total: number): {
  netTotal: number;
  taxTotal: number;
} {
  const netTotal = roundClp(total / (1 + TAX_RATE));
  return { netTotal, taxTotal: total - netTotal };
}
