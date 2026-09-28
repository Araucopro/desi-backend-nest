import { ColumnNumericTransformer } from './numeric.transformer';

describe('ColumnNumericTransformer', () => {
  const transformer = new ColumnNumericTransformer();

  it('convierte el string que devuelve el driver a number', () => {
    expect(transformer.from('50000.00')).toBe(50000);
    expect(transformer.from('0.01')).toBe(0.01);
    expect(transformer.from('-2000.50')).toBe(-2000.5);
  });

  it('preserva null en lugar de producir NaN', () => {
    // Regresión: `parseFloat(null)` devuelve NaN, que es un number válido y por
    // eso se propagaba en silencio a los cálculos de dinero.
    expect(transformer.from(null)).toBeNull();
  });

  it('preserva undefined', () => {
    expect(transformer.from(undefined)).toBeUndefined();
  });

  it('no altera el valor al escribir', () => {
    expect(transformer.to(50000)).toBe(50000);
    expect(transformer.to(null)).toBeNull();
    expect(transformer.to(undefined)).toBeUndefined();
  });
});
