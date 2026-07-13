import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  LessThanOrEqual,
  MoreThanOrEqual,
  IsNull,
  SelectQueryBuilder,
} from 'typeorm';
import {
  SpecialOffer,
  DiscountType,
  DiscountScope,
} from './entities/special-offer.entity';
import { CreateSpecialOfferDto } from './dto/create-special-offer.dto';
import { UpdateSpecialOfferDto } from './dto/update-special-offer.dto';

@Injectable()
export class OfferService {
  constructor(
    @InjectRepository(SpecialOffer)
    private readonly specialOfferRepository: Repository<SpecialOffer>,
  ) {}

  async createSpecialOffer(
    createSpecialOfferDto: CreateSpecialOfferDto,
  ): Promise<SpecialOffer> {
    const { startDate, endDate, storeProductID, ...rest } =
      createSpecialOfferDto;
    this.validateDateRange(startDate, endDate);

    const offer = this.specialOfferRepository.create({
      ...rest,
      startDate: new Date(startDate),
      endDate: endDate ? new Date(endDate) : undefined,
      storeProduct: { storeProductID } as SpecialOffer['storeProduct'],
    });
    return this.specialOfferRepository.save(offer);
  }

  async updateSpecialOffer(
    offerID: string,
    updateSpecialOfferDto: UpdateSpecialOfferDto,
  ): Promise<SpecialOffer> {
    const offer = await this.specialOfferRepository.findOne({
      where: { offerID },
    });
    if (!offer) throw new NotFoundException('Oferta especial no encontrada');

    const { startDate, endDate, storeProductID, ...rest } =
      updateSpecialOfferDto;
    this.validateDateRange(
      startDate ?? offer.startDate,
      endDate ?? offer.endDate,
    );

    Object.assign(offer, {
      ...rest,
      ...(startDate ? { startDate: new Date(startDate) } : {}),
      ...(endDate !== undefined
        ? { endDate: endDate ? new Date(endDate) : null }
        : {}),
      ...(storeProductID
        ? { storeProduct: { storeProductID } as SpecialOffer['storeProduct'] }
        : {}),
    });
    return this.specialOfferRepository.save(offer);
  }

  async getSpecialOffers(storeProductID?: string): Promise<SpecialOffer[]> {
    const query: SelectQueryBuilder<SpecialOffer> = this.specialOfferRepository
      .createQueryBuilder('offer')
      .leftJoinAndSelect('offer.storeProduct', 'storeProduct')
      .leftJoinAndSelect('storeProduct.store', 'store')
      .leftJoinAndSelect('storeProduct.variation', 'variation')
      .leftJoinAndSelect('variation.product', 'product')
      .orderBy('offer.startDate', 'DESC')
      .addOrderBy('offer.createdAt', 'DESC');

    if (storeProductID) {
      query.andWhere('storeProduct.storeProductID = :storeProductID', {
        storeProductID,
      });
    }

    return query.getMany();
  }

  async getActiveOffers(
    storeProductID: string,
    pricingDate: Date = new Date(),
  ): Promise<SpecialOffer[]> {
    return this.specialOfferRepository.find({
      where: [
        {
          storeProduct: { storeProductID },
          isActive: true,
          startDate: LessThanOrEqual(pricingDate),
          endDate: MoreThanOrEqual(pricingDate),
        },
        {
          storeProduct: { storeProductID },
          isActive: true,
          startDate: LessThanOrEqual(pricingDate),
          endDate: IsNull(),
        },
      ],
      order: { startDate: 'DESC', createdAt: 'DESC' },
    });
  }

  async getBestOffer(
    storeProductID: string,
    unitPrice: number,
    quantity: number,
    pricingDate: Date = new Date(),
  ): Promise<(SpecialOffer & { priority: number }) | null> {
    const offers = await this.getActiveOffers(storeProductID, pricingDate);

    if (!offers.length) {
      return null;
    }

    const rankedOffers = offers
      .map((offer) => ({
        offer,
        finalPrice: this.simulateOfferPrice(offer, unitPrice, quantity),
        priority: this.resolveOfferPriority(offer),
      }))
      .sort((left, right) => {
        if (left.finalPrice !== right.finalPrice) {
          return left.finalPrice - right.finalPrice;
        }
        if (left.priority !== right.priority) {
          return right.priority - left.priority;
        }
        return right.offer.startDate.getTime() - left.offer.startDate.getTime();
      });

    const best = rankedOffers[0];
    return Object.assign(best.offer, { priority: best.priority });
  }

  async getActiveOffer(storeProductID: string): Promise<SpecialOffer | null> {
    const [firstOffer] = await this.getActiveOffers(storeProductID);
    return firstOffer ?? null;
  }

  private validateDateRange(
    startDateValue: string | Date,
    endDateValue?: string | Date,
  ) {
    if (!endDateValue) {
      return;
    }

    const startDate = new Date(startDateValue);
    const endDate = new Date(endDateValue);

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      throw new BadRequestException('Rango de fechas invalido para la oferta');
    }

    if (endDate < startDate) {
      throw new BadRequestException(
        'La fecha de termino no puede ser anterior al inicio',
      );
    }
  }

  private simulateOfferPrice(
    offer: SpecialOffer,
    unitPrice: number,
    quantity: number,
  ): number {
    const currentPrice = unitPrice * quantity;
    const currentUnitPrice = quantity > 0 ? currentPrice / quantity : 0;
    const scope = offer.scope ?? DiscountScope.UNIT;

    switch (offer.discountType) {
      case DiscountType.PERCENTAGE:
        if (scope === DiscountScope.UNIT) {
          return currentUnitPrice * (1 - offer.value / 100) * quantity;
        }
        return currentPrice * (1 - offer.value / 100);
      case DiscountType.FIXED_AMOUNT:
        if (scope === DiscountScope.UNIT) {
          return Math.max(0, currentUnitPrice - offer.value) * quantity;
        }
        return Math.max(0, currentPrice - offer.value);
      case DiscountType.FIXED_PRICE:
        return scope === DiscountScope.UNIT
          ? offer.value * quantity
          : offer.value;
      default:
        return currentPrice;
    }
  }

  private resolveOfferPriority(offer: SpecialOffer): number {
    let priority = 0;

    if (offer.exclusive) {
      priority += 100;
    }
    if ((offer.scope ?? DiscountScope.UNIT) === DiscountScope.TOTAL) {
      priority += 10;
    }
    if (offer.discountType === DiscountType.FIXED_PRICE) {
      priority += 5;
    }

    return priority;
  }
}
