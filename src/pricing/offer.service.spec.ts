import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OfferService } from './offer.service';
import {
  DiscountScope,
  DiscountType,
  SpecialOffer,
} from './entities/special-offer.entity';

describe('OfferService', () => {
  let service: OfferService;
  let repository: jest.Mocked<Repository<SpecialOffer>>;

  const mockRepository = {
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OfferService,
        {
          provide: getRepositoryToken(SpecialOffer),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<OfferService>(OfferService);
    repository = module.get(getRepositoryToken(SpecialOffer));
    jest.clearAllMocks();
  });

  it('returns the offer that produces the lowest final price', async () => {
    repository.find.mockResolvedValue([
      {
        offerID: 'offer-low',
        discountType: DiscountType.PERCENTAGE,
        scope: DiscountScope.UNIT,
        value: 10,
        exclusive: false,
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      {
        offerID: 'offer-best',
        discountType: DiscountType.FIXED_PRICE,
        scope: DiscountScope.TOTAL,
        value: 70,
        exclusive: true,
        startDate: new Date('2026-01-02T00:00:00.000Z'),
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
      },
    ] as SpecialOffer[]);

    const result = await service.getBestOffer('sp-1', 40, 2, new Date());

    expect(result?.offerID).toBe('offer-best');
    expect(result?.priority).toBeGreaterThan(0);
  });

  it('lists all special offers with product context', async () => {
    const getMany = jest.fn().mockResolvedValue([
      {
        offerID: 'offer-1',
        description: 'Promo',
        storeProduct: {
          storeProductID: 'sp-1',
          store: { storeID: 'store-1' },
          variation: {
            variationID: 'variation-1',
            product: { productID: 'product-1' },
          },
        },
      },
    ]);
    const queryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany,
    };
    repository.createQueryBuilder.mockReturnValue(queryBuilder as never);

    const result = await service.getSpecialOffers();

    expect(mockRepository.createQueryBuilder).toHaveBeenCalledWith('offer');
    expect(queryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
      'offer.storeProduct',
      'storeProduct',
    );
    expect(result).toHaveLength(1);
    expect(result[0].storeProduct.store.storeID).toBe('store-1');
  });
});
