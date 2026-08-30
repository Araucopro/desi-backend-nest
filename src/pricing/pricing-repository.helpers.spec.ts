import { StoreProduct } from '../relations/storeproduct/entities/storeproduct.entity';
import { PriceHistory, PriceType } from './entities/price-history.entity';
import {
  findCentralStoreProductsForVariations,
  findPriceHistoryList,
  findStoreProductByIdWithStore,
  findStoreProductOrCreate,
  findStoreProductsByStoreAndIDs,
  recordPriceChange,
} from './pricing-repository.helpers';

describe('pricing-repository.helpers', () => {
  it('returns an existing StoreProduct for the store and variation', async () => {
    const existing = { storeProductID: 'sp-1' } as StoreProduct;
    const manager = {
      findOne: jest.fn().mockResolvedValue(existing),
      create: jest.fn(),
    } as any;

    await expect(
      findStoreProductOrCreate(manager, 'store-1', 'var-1'),
    ).resolves.toBe(existing);
    expect(manager.findOne).toHaveBeenCalledWith(StoreProduct, {
      where: {
        store: { storeID: 'store-1' },
        variation: { variationID: 'var-1' },
      },
    });
    expect(manager.create).not.toHaveBeenCalled();
  });

  it('creates a zeroed StoreProduct when none exists', async () => {
    const created = { storeProductID: 'sp-new' } as StoreProduct;
    const manager = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockReturnValue(created),
    } as any;

    await expect(
      findStoreProductOrCreate(manager, 'store-1', 'var-1'),
    ).resolves.toBe(created);
    expect(manager.create).toHaveBeenCalledWith(
      StoreProduct,
      expect.objectContaining({
        store: { storeID: 'store-1' },
        variation: { variationID: 'var-1' },
        stock: 0,
        priceCost: 0,
        priceList: 0,
      }),
    );
  });

  it('records a COST change and saves history plus StoreProduct', async () => {
    const storeProduct = {
      tenantID: 'tenant-1',
      priceCost: 100,
      priceList: 200,
    } as StoreProduct;
    const history = { historyID: 'history-1' } as PriceHistory;
    const manager = {
      create: jest.fn().mockReturnValue(history),
      save: jest.fn().mockImplementation(async (entity) => entity),
    } as any;

    const result = await recordPriceChange(manager, storeProduct, {
      priceType: PriceType.COST,
      oldPrice: 100,
      newPrice: 120,
      reason: 'Actualización',
      changedBy: 'user-1',
    });

    expect(manager.create).toHaveBeenCalledWith(
      PriceHistory,
      expect.objectContaining({
        tenantID: 'tenant-1',
        storeProduct,
        priceType: PriceType.COST,
        oldPrice: 100,
        newPrice: 120,
        reason: 'Actualización',
        changedBy: 'user-1',
      }),
    );
    expect(manager.save).toHaveBeenNthCalledWith(1, history);
    expect(manager.save).toHaveBeenNthCalledWith(2, storeProduct);
    expect(storeProduct.priceCost).toBe(120);
    expect(storeProduct.priceList).toBe(200);
    expect(result).toBe(history);
  });

  it('records a LIST change on the StoreProduct price list', async () => {
    const storeProduct = {
      tenantID: 'tenant-1',
      priceCost: 100,
      priceList: 200,
    } as StoreProduct;
    const manager = {
      create: jest.fn().mockReturnValue({} as PriceHistory),
      save: jest.fn().mockImplementation(async (entity) => entity),
    } as any;

    await recordPriceChange(manager, storeProduct, {
      priceType: PriceType.LIST,
      oldPrice: 200,
      newPrice: 250,
    });

    expect(storeProduct.priceList).toBe(250);
    expect(storeProduct.priceCost).toBe(100);
  });

  it('lists price history with store and variation filters', async () => {
    const historyRows = [{ historyID: 'history-1' }] as PriceHistory[];
    const getMany = jest.fn().mockResolvedValue(historyRows);
    const queryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany,
    };
    const repo = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    } as any;

    const result = await findPriceHistoryList(repo, {
      storeID: 'store-1',
      variationID: 'var-1',
    });

    expect(repo.createQueryBuilder).toHaveBeenCalledWith('history');
    expect(queryBuilder.orderBy).toHaveBeenCalledWith(
      'history.effectiveDate',
      'DESC',
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'store.storeID = :storeID',
      { storeID: 'store-1' },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'variation.variationID = :variationID',
      { variationID: 'var-1' },
    );
    expect(result).toBe(historyRows);
  });

  it('loads a StoreProduct by id with its store', async () => {
    const row = { storeProductID: 'sp-1' } as StoreProduct;
    const manager = { findOne: jest.fn().mockResolvedValue(row) } as any;

    await expect(findStoreProductByIdWithStore(manager, 'sp-1')).resolves.toBe(
      row,
    );
    expect(manager.findOne).toHaveBeenCalledWith(StoreProduct, {
      where: { storeProductID: 'sp-1' },
      relations: ['store'],
    });
  });

  it('loads StoreProducts by store and ids with full relations', async () => {
    const rows = [{ storeProductID: 'sp-1' }] as StoreProduct[];
    const manager = { find: jest.fn().mockResolvedValue(rows) } as any;

    await expect(
      findStoreProductsByStoreAndIDs(manager, 'store-1', ['sp-1', 'sp-2']),
    ).resolves.toBe(rows);
    expect(manager.find).toHaveBeenCalledWith(
      StoreProduct,
      expect.objectContaining({
        where: {
          store: { storeID: 'store-1' },
          storeProductID: expect.anything(),
        },
        relations: [
          'store',
          'variation',
          'variation.product',
          'variation.product.category',
        ],
      }),
    );
  });

  it('loads central StoreProducts for the given variations', async () => {
    const rows = [{ storeProductID: 'sp-central' }] as StoreProduct[];
    const manager = { find: jest.fn().mockResolvedValue(rows) } as any;

    await expect(
      findCentralStoreProductsForVariations(manager, ['var-1']),
    ).resolves.toBe(rows);
    expect(manager.find).toHaveBeenCalledWith(
      StoreProduct,
      expect.objectContaining({
        where: {
          store: { isCentralStore: true },
          variation: { variationID: expect.anything() },
        },
        relations: ['store'],
      }),
    );
  });
});
