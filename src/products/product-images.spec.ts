import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { BulkProductItemDto } from './dto/create-products-bulk.dto';
import { hasWebContent, isProductImageList } from './product-images';

const photo = 'https://res.cloudinary.com/demo/image/upload/boot.jpg';
describe('ERP product photos and web publication', () => {
  it('accepts a legacy photo and five comma-separated URLs longer than 255 characters', () => {
    const gallery = Array.from(
      { length: 5 },
      (_, index) => `${photo}?v=${index}`,
    ).join(', ');
    expect(gallery.length).toBeGreaterThan(255);
    expect(isProductImageList(photo)).toBe(true);
    expect(isProductImageList(gallery)).toBe(true);
    for (const type of [
      CreateProductDto,
      UpdateProductDto,
      BulkProductItemDto,
    ]) {
      const dto = plainToInstance(type as typeof CreateProductDto, {
        image: gallery,
      });
      expect(
        validateSync(dto).some((error) => error.property === 'image'),
      ).toBe(false);
    }
  });
  it.each([
    'javascript:alert(1)',
    '/mock.jpg',
    `${photo},`,
    `${photo}, not-a-url`,
    Array(6).fill(photo).join(','),
  ])('rejects invalid lists on create, patch and bulk: %s', (image) => {
    for (const type of [
      CreateProductDto,
      UpdateProductDto,
      BulkProductItemDto,
    ]) {
      const dto = plainToInstance(type as typeof CreateProductDto, { image });
      expect(
        validateSync(dto).some((error) => error.property === 'image'),
      ).toBe(true);
    }
  });
  it('allows optional photos but always requires description and slug', () => {
    const product = { slug: 'boot', description: 'Ready', image: '' };
    expect(hasWebContent(product, false)).toBe(true);
    expect(hasWebContent(product)).toBe(false);
    expect(hasWebContent({ ...product, slug: ' ' }, false)).toBe(false);
    expect(hasWebContent({ ...product, description: ' ' }, false)).toBe(false);
  });
  it('allows inventory drafts but requires all three web fields to publish', () => {
    expect(isProductImageList('')).toBe(true);
    expect(
      hasWebContent({ image: photo, slug: 'boot', description: 'Ready' }),
    ).toBe(true);
    for (const missing of [{ image: '' }, { slug: ' ' }, { description: '' }]) {
      expect(
        hasWebContent({
          image: photo,
          slug: 'boot',
          description: 'Ready',
          ...missing,
        }),
      ).toBe(false);
    }
  });
});
