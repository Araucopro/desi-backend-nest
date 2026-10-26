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

/** Empty photos are allowed in inventory; each channel chooses if they are required online. */
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

/** Editorial fields do not control publication; only the channel photo policy applies. */
export function meetsChannelPhotoPolicy(
  product: {
    image?: string | null;
    slug?: string | null;
    description?: string | null;
  },
  requireProductPhoto = true,
): boolean {
  return (
    !requireProductPhoto || productImages(product.image).some(isProductImageUrl)
  );
}
