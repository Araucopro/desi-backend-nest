import { registerDecorator, ValidationOptions } from 'class-validator';

export function productImages(value?: string | null): string[] {
  return [
    ...new Set(
      (value ?? '')
        .split(',')
        .map((url) => url.trim())
        .filter(Boolean),
    ),
  ];
}

export function isProductImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      ['https:', 'http:'].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

/** Empty photos are allowed in inventory; the commerce catalog requires one. */
export function isProductImageList(value: unknown): boolean {
  if (typeof value !== 'string' || value.length > 10000) return false;
  if (!value.trim()) return true;
  const urls = value.split(',').map((url) => url.trim());
  return urls.length <= 5 && urls.every(isProductImageUrl);
}

export function IsProductImageList(
  options?: ValidationOptions,
): PropertyDecorator {
  return (target, propertyKey) =>
    registerDecorator({
      name: 'isProductImageList',
      target: target.constructor,
      propertyName: String(propertyKey),
      options,
      validator: {
        validate: isProductImageList,
        defaultMessage: () =>
          'image debe contener hasta 5 URLs HTTP/HTTPS separadas por comas (maximo 10000 caracteres)',
      },
    });
}

export function hasWebContent(product: {
  image?: string | null;
  slug?: string | null;
  description?: string | null;
}): boolean {
  return Boolean(
    product.slug?.trim() &&
    product.description?.trim() &&
    productImages(product.image).some(isProductImageUrl),
  );
}
