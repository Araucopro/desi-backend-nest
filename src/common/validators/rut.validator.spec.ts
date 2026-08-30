import { validateRut } from './rut.validator';

describe('validateRut', () => {
  it.each([
    ['1-9'],
    ['11111111-1'],
    ['66666666-6'],
    ['76.234.556-0'],
    ['12.345.678-5'],
    [' 12345678-5 '],
  ])('accepts valid RUT %s', (value) => {
    expect(validateRut(value)).toBe(true);
  });

  it.each([
    ['12345678-9'],
    ['66666666-5'],
    ['12.345.678-4'],
    ['1234567-8'],
    ['123456789-5'],
    ['abc'],
    ['123'],
    [''],
    [null],
    [12345678],
  ])('rejects invalid RUT %s', (value) => {
    expect(validateRut(value)).toBe(false);
  });
});
