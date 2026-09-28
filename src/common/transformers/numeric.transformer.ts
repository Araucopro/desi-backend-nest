import { ValueTransformer } from 'typeorm';

/**
 * Convierte las columnas `decimal` de Postgres (que el driver entrega como
 * `string` para no perder precisión) al `number` que espera el dominio.
 *
 * Preserva `null` y `undefined`: los valores no-string se devuelven tal cual.
 * Sin esa guarda, `parseFloat(null)` produce **`NaN`**, que es un valor
 * numérico válido para TypeScript y por eso se propaga en silencio hasta los
 * cálculos de dinero en vez de fallar. Aplica a toda columna `decimal`
 * nullable: `cashDifference`, `expectedCashBalance`, `countedCashBalance`,
 * `paidAt`-adyacentes de órdenes, descuentos de devoluciones, etc.
 *
 * El lado `to` no transforma nada a propósito: se deja que Postgres interprete
 * el parámetro.
 */
export class ColumnNumericTransformer implements ValueTransformer {
  to(data: number | null | undefined): number | null | undefined {
    return data;
  }

  from(data: string | null | undefined): number | null | undefined {
    if (typeof data !== 'string') return data;

    return parseFloat(data);
  }
}
