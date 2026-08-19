import { EntityManager, In, Repository } from 'typeorm';
import { PriceHistory, PriceType } from './entities/price-history.entity';
import { StoreProduct } from '../relations/storeproduct/entities/storeproduct.entity';
import { PricingListQueryDto } from './dto/pricing-list.query.dto';

export async function findStoreProductOrCreate(
  manager: EntityManager,
  storeID: string,
  variationID: string,
): Promise<StoreProduct> {
  let storeProduct = await manager.findOne(StoreProduct, {
    where: {
      store: { storeID },
      variation: { variationID },
    },
  });

  if (!storeProduct) {
    storeProduct = manager.create(StoreProduct, {
      store: { storeID },
      variation: { variationID },
      stock: 0,
      priceCost: 0,
      priceList: 0,
    });
  }

  return storeProduct;
}

export async function recordPriceChange(
  manager: EntityManager,
  storeProduct: StoreProduct,
  changes: {
    priceType: PriceType;
    oldPrice: number;
    newPrice: number;
    reason?: string;
    changedBy?: string;
  },
): Promise<PriceHistory> {
  const history = manager.create(PriceHistory, {
    tenantID: storeProduct.tenantID,
    storeProduct,
    priceType: changes.priceType,
    oldPrice: changes.oldPrice,
    newPrice: changes.newPrice,
    reason: changes.reason,
    changedBy: changes.changedBy,
  });
  const savedHistory = await manager.save(history);

  if (changes.priceType === PriceType.COST) {
    storeProduct.priceCost = changes.newPrice;
  } else {
    storeProduct.priceList = changes.newPrice;
  }
  await manager.save(storeProduct);

  return savedHistory;
}

export async function findPriceHistoryList(
  repo: Repository<PriceHistory>,
  filters: PricingListQueryDto = {},
): Promise<PriceHistory[]> {
  const query = repo
    .createQueryBuilder('history')
    .leftJoinAndSelect('history.storeProduct', 'storeProduct')
    .leftJoinAndSelect('storeProduct.store', 'store')
    .leftJoinAndSelect('storeProduct.variation', 'variation')
    .leftJoinAndSelect('variation.product', 'product')
    .orderBy('history.effectiveDate', 'DESC');

  if (filters.storeProductID) {
    query.andWhere('storeProduct.storeProductID = :storeProductID', {
      storeProductID: filters.storeProductID,
    });
  }

  if (filters.storeID) {
    query.andWhere('store.storeID = :storeID', {
      storeID: filters.storeID,
    });
  }

  if (filters.variationID) {
    query.andWhere('variation.variationID = :variationID', {
      variationID: filters.variationID,
    });
  }

  return query.getMany();
}

export async function findStoreProductByIdWithStore(
  manager: EntityManager,
  storeProductID: string,
): Promise<StoreProduct | null> {
  return manager.findOne(StoreProduct, {
    where: { storeProductID },
    relations: ['store'],
  });
}

export async function findStoreProductsByStoreAndIDs(
  manager: EntityManager,
  storeID: string,
  storeProductIDs: string[],
): Promise<StoreProduct[]> {
  return manager.find(StoreProduct, {
    where: {
      store: { storeID },
      storeProductID: In(storeProductIDs),
    },
    relations: [
      'store',
      'variation',
      'variation.product',
      'variation.product.category',
    ],
  });
}

export async function findCentralStoreProductsForVariations(
  manager: EntityManager,
  variationIDs: string[],
): Promise<StoreProduct[]> {
  return manager.find(StoreProduct, {
    where: {
      store: { isCentralStore: true },
      variation: { variationID: In(variationIDs) },
    },
    relations: ['store'],
  });
}
