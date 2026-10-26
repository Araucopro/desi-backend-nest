import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { BulkProductItemDto } from './dto/create-products-bulk.dto';
import { meetsChannelPhotoPolicy, isProductImageList } from './product-images';

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
  it('does not require editorial fields when the channel permits missing photos', () => {
    const product = { slug: 'boot', description: 'Ready', image: '' };
    expect(meetsChannelPhotoPolicy(product, false)).toBe(true);
    expect(meetsChannelPhotoPolicy(product)).toBe(false);
    expect(meetsChannelPhotoPolicy({ ...product, slug: ' ' }, false)).toBe(
      true,
    );
    expect(
      meetsChannelPhotoPolicy({ ...product, description: ' ' }, false),
    ).toBe(true);
  });
  it('enforces only the explicit photo policy, independently of description or slug', () => {
    expect(isProductImageList('')).toBe(true);
    expect(
      meetsChannelPhotoPolicy({
        image: photo,
        slug: 'boot',
        description: 'Ready',
      }),
    ).toBe(true);
    for (const missing of [{ slug: ' ' }, { description: '' }]) {
      expect(
        meetsChannelPhotoPolicy({
          image: photo,
          slug: 'boot',
          description: 'Ready',
          ...missing,
        }),
      ).toBe(true);
    }
  });
});
