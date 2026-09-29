import { slugifyProductName } from './products-slug';

describe('slugifyProductName', () => {
  it('normalizes spaces, punctuation, and diacritics', () => {
    expect(slugifyProductName('Desí Outdoor Queulat Vantablack Hiking')).toBe(
      'desi-outdoor-queulat-vantablack-hiking',
    );
  });

  it('returns a safe fallback when the name has no ASCII letters or digits', () => {
    expect(slugifyProductName('!!!')).toBe('product');
  });
});
