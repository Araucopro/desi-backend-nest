import { Injectable, BadRequestException } from '@nestjs/common';

@Injectable()
export class MarginValidator {
  validate(priceCost: number, finalPrice: number) {
    const minMarginPercent = parseFloat(
      process.env.MIN_MARGIN_PERCENT || '0.1',
    );
    const minAllowedPrice = (priceCost || 0) * (1 + minMarginPercent);
    if (finalPrice < minAllowedPrice) {
      throw new BadRequestException(
        'Violación de margen: precio final por debajo del mínimo permitido',
      );
    }
  }
}
