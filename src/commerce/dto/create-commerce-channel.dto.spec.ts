import { validateSync } from 'class-validator';
import {
  CreateCommerceChannelDto,
  UpdateCommerceChannelDto,
} from './create-commerce-channel.dto';

for (const type of [CreateCommerceChannelDto, UpdateCommerceChannelDto]) {
  describe(`${type.name} photo policy`, () => {
    it.each([true, false, undefined])(
      'accepts boolean or omitted policy: %s',
      (requireProductPhoto) => {
        const dto = Object.assign(new type(), { requireProductPhoto });
        expect(
          validateSync(dto).some(
            (error) => error.property === 'requireProductPhoto',
          ),
        ).toBe(false);
      },
    );
    it.each(['false', 'true', 0, 1, null])(
      'rejects non-boolean policy: %s',
      (requireProductPhoto) => {
        const dto = Object.assign(new type(), { requireProductPhoto });
        expect(
          validateSync(dto).some(
            (error) => error.property === 'requireProductPhoto',
          ),
        ).toBe(true);
      },
    );
  });
}
