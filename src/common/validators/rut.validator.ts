import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/**
 * Valida RUT chileno (1-8 dígitos + dígito verificador 0-9 o K).
 * Acepta puntos, guiones y espacios: "76.234.556-6", "76234556-6", etc.
 */
export function validateRut(value: unknown): boolean {
  if (typeof value !== 'string') return false;

  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/\./g, '')
    .replace(/-/g, '');
  const match = /^(\d{1,8})([0-9K])$/.exec(normalized);
  if (!match) return false;

  const body = match[1];
  const dv = match[2];
  let sum = 0;
  let multiplier = 2;

  for (let index = body.length - 1; index >= 0; index -= 1) {
    sum += Number(body[index]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }

  const remainder = sum % 11;
  const expected = 11 - remainder;
  const expectedChar =
    expected === 11 ? '0' : expected === 10 ? 'K' : String(expected);

  return expectedChar === dv;
}

@ValidatorConstraint({ name: 'isRut', async: false })
export class IsRutConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return validateRut(value);
  }

  defaultMessage(): string {
    return 'RUT inválido';
  }
}

export function IsRut(validationOptions?: ValidationOptions) {
  return function validate(object: object, propertyName: string): void {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsRutConstraint,
    });
  };
}
