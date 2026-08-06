import { BadRequestException } from '@nestjs/common';
import { SalesService } from './sales.service';
import {
  Sale,
  SalePaymentType,
  SaleStatus,
  SaleType,
} from './entities/sale.entity';
import { SaleItem } from './entities/sale-item.entity';
import { SaleFolioCounter } from './entities/sale-folio-counter.entity';
import { Store } from '../stores/entities/store.entity';
import { StoreProduct } from '../relations/storeproduct/entities/storeproduct.entity';
import {
  DteDocument,
  DteDocumentStatus,
} from '../dte/entities/dte-document.entity';

function createManagerMock(
  initial: {
    sale?: any;
    folioCounter?: Partial<SaleFolioCounter> | null;
    stock?: number;
  } = {},
) {
  const store = {
    storeID: 'store-1',
    tenantID: 'tenant-1',
    rut: '76123456-7',
    name: 'Tienda Demo',
    businessName: 'Tienda Demo SpA',
    address: 'Av. Siempre Viva 123',
    city: 'Santiago',
    phone: '+56 2 1234 5678',
    giro: 'VENTA AL POR MENOR',
    acteco: '479100',
    location: 'Santiago',
  };
  const storeProduct = {
    storeProductID: 'sp-1',
    tenantID: 'tenant-1',
    stock: initial.stock ?? 10,
    priceCost: 400,
    priceList: 1190,
    variation: {
      variationID: 'var-1',
      sku: 'SKU-1',
      product: { name: 'Producto A' },
    },
  };
  let sale: Partial<Sale> | null = initial.sale ?? null;
  let folioCounter: Partial<SaleFolioCounter> | null =
    initial.folioCounter ?? null;
  const savedSales: Array<Partial<Sale>> = [];
  const savedItems: Array<Partial<SaleItem>> = [];

  function findSale(options?: { where?: Record<string, unknown> }) {
    const where = options?.where ?? {};
    if (where.saleID) {
      return sale && sale.saleID === where.saleID ? sale : null;
    }
    if (where.idempotencyKey) {
      return (
        savedSales.find(
          (item) => item.idempotencyKey === where.idempotencyKey,
        ) ?? (sale?.idempotencyKey === where.idempotencyKey ? sale : null)
      );
    }
    return sale;
  }

  const manager = {
    findOne: jest.fn(async (entity: unknown, criteria?: unknown) => {
      if (entity === Store) return store;
      if (entity === StoreProduct) return storeProduct;
      if (entity === SaleFolioCounter) return folioCounter;
      if (entity === Sale) {
        return findSale(criteria as { where?: Record<string, unknown> });
      }
      return null;
    }),
    create: jest.fn((_entity: unknown, values: object) => ({ ...values })),
    save: jest.fn(async (entityOrArray: unknown) => {
      if (Array.isArray(entityOrArray)) {
        for (const entity of entityOrArray) {
          await manager.save(entity);
        }
        return entityOrArray;
      }
      const entity = entityOrArray as Record<string, unknown>;
      if (entity.saleType) {
        entity.saleID ??= 'sale-1';
        if (!savedSales.some((item) => item.saleID === entity.saleID)) {
          savedSales.push(entity as Partial<Sale>);
        }
        sale = entity as Partial<Sale>;
        return entity;
      }
      if (entity.currentFolio !== undefined) {
        folioCounter = entity as Partial<SaleFolioCounter>;
        return entity;
      }
      if (entity.unitPrice !== undefined) {
        entity.saleItemID ??= `item-${savedItems.length + 1}`;
        savedItems.push(entity as Partial<SaleItem>);
        return entity;
      }
      return entity;
    }),
    query: jest.fn().mockResolvedValue(undefined),
    getRepository: jest.fn((entity: unknown) => {
      if (entity === Sale) {
        return {
          findOne: async (options?: { where?: Record<string, unknown> }) =>
            findSale(options),
          createQueryBuilder: jest.fn().mockImplementation(() => {
            const builder: Record<string, jest.Mock> = {};
            const methods = [
              'leftJoinAndSelect',
              'where',
              'andWhere',
              'orderBy',
              'skip',
              'take',
            ];
            for (const method of methods) {
              builder[method] = jest.fn().mockReturnValue(builder);
            }
            builder.getManyAndCount = jest.fn().mockResolvedValue([[], 0]);
            return builder;
          }),
        };
      }
      return {};
    }),
  };

  return { manager, storeProduct, sale: () => sale, savedSales, savedItems };
}

describe('SalesService', () => {
  const pricingService = {
    calculatePrice: jest.fn(),
  };
  const dteService = {
    create: jest.fn(),
    reconcile: jest.fn(),
  };
  const dteMapperService = {
    mapSaleToDte: jest.fn(),
  };
  const financialMovementsService = {
    recordSaleNote: jest.fn().mockResolvedValue(undefined),
    removeSaleNote: jest.fn().mockResolvedValue(undefined),
  };

  let dataSource: { transaction: jest.Mock };
  let ctx: ReturnType<typeof createManagerMock>;

  beforeEach(() => {
    jest.clearAllMocks();
    ctx = createManagerMock();
    dataSource = { transaction: jest.fn((cb) => cb(ctx.manager)) };
    pricingService.calculatePrice.mockResolvedValue({
      finalPrice: 1190,
      basePrice: 1190,
    });
    dteService.create.mockResolvedValue({
      dteDocumentID: 'dte-1',
      TOKEN: 'token-1',
      FOLIO: 123,
      STATUS: DteDocumentStatus.EMITIDO,
    });
    dteMapperService.mapSaleToDte.mockReturnValue({} as any);
  });

  function createService() {
    return new SalesService(
      {} as any,
      {} as any,
      {} as any,
      dataSource as any,
      pricingService as any,
      dteService as any,
      dteMapperService as any,
      financialMovementsService as any,
    );
  }

  function notaVentaDto() {
    return {
      saleType: SaleType.NOTA_VENTA,
      paymentType: SalePaymentType.CASH,
      items: [{ storeProductID: 'sp-1', quantity: 1 }],
    };
  }

  it('creates a nota de venta with stock movement, folio and ledger', async () => {
    const service = createService();

    const result = await service.create(
      'store-1',
      undefined,
      notaVentaDto() as any,
    );

    const sale = ctx.sale();
    expect(sale).toMatchObject({
      saleType: SaleType.NOTA_VENTA,
      status: SaleStatus.EMITIDA,
      folio: 1,
      total: 1190,
      netTotal: 1000,
      taxTotal: 190,
      cogsTotal: 400,
    });
    expect(ctx.storeProduct.stock).toBe(9);
    expect(ctx.savedItems).toHaveLength(1);
    expect(ctx.savedItems[0]).toMatchObject({
      storeProductID: 'sp-1',
      quantity: 1,
      unitPrice: 1190,
      unitCost: 400,
      lineTotal: 1190,
    });
    expect(financialMovementsService.recordSaleNote).toHaveBeenCalledWith(
      ctx.manager,
      expect.objectContaining({
        storeID: 'store-1',
        netTotal: 1000,
        taxTotal: 190,
        cogsTotal: 400,
      }),
    );
    expect(dteService.create).not.toHaveBeenCalled();
    expect(result.dte).toBeNull();
  });

  it('reuses an existing nota de venta by idempotency key', async () => {
    ctx = createManagerMock({
      sale: {
        saleID: 'sale-1',
        storeID: 'store-1',
        idempotencyKey: 'idem-1',
        saleType: SaleType.NOTA_VENTA,
        status: SaleStatus.EMITIDA,
        total: 1190,
      },
    });
    dataSource.transaction.mockImplementation((cb) => cb(ctx.manager));
    const service = createService();

    const result = await service.create(
      'store-1',
      'idem-1',
      notaVentaDto() as any,
    );

    expect(result.sale.saleID).toBe('sale-1');
    expect(ctx.storeProduct.stock).toBe(10);
    expect(financialMovementsService.recordSaleNote).not.toHaveBeenCalled();
  });

  it('emits a factura through DteService and persists the sale linked to the DTE', async () => {
    const service = createService();
    const dto = {
      saleType: SaleType.FACTURA,
      paymentType: SalePaymentType.CREDIT,
      receiver: { rut: '66666666-6', name: 'Cliente SpA' },
      items: [{ storeProductID: 'sp-1', quantity: 1 }],
    };

    const result = await service.create('store-1', undefined, dto as any);

    expect(dteMapperService.mapSaleToDte).toHaveBeenCalledWith(
      expect.objectContaining({ total: 1190, netTotal: 1000, taxTotal: 190 }),
      { documentType: 33 },
    );
    expect(dteService.create).toHaveBeenCalledWith(
      'store-1',
      undefined,
      {},
      { reserveStock: true },
    );
    expect(ctx.sale()).toMatchObject({
      saleType: SaleType.FACTURA,
      dteDocumentID: 'dte-1',
      folio: 123,
      total: 1190,
    });
    expect(ctx.storeProduct.stock).toBe(10);
    expect(financialMovementsService.recordSaleNote).not.toHaveBeenCalled();
    expect(result.dte).toMatchObject({
      dteDocumentID: 'dte-1',
      FOLIO: 123,
      STATUS: DteDocumentStatus.EMITIDO,
    });
  });

  it('rejects a factura without receiver before calling DTE', async () => {
    const service = createService();
    const dto = {
      saleType: SaleType.FACTURA,
      paymentType: SalePaymentType.CASH,
      items: [{ storeProductID: 'sp-1', quantity: 1 }],
    };

    await expect(
      service.create('store-1', undefined, dto as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(dteService.create).not.toHaveBeenCalled();
  });

  it('converts a nota de venta without reserving stock again and replaces the ledger', async () => {
    const sale = {
      saleID: 'sale-1',
      storeID: 'store-1',
      tenantID: 'tenant-1',
      saleType: SaleType.NOTA_VENTA,
      status: SaleStatus.EMITIDA,
      paymentType: SalePaymentType.CASH,
      folio: 1,
      issueDate: new Date('2026-08-06'),
      receiver: { rut: '66666666-6', name: 'Cliente' },
      subtotal: 1190,
      discount: 0,
      netTotal: 1000,
      taxTotal: 190,
      total: 1190,
      cogsTotal: 400,
      items: [
        {
          saleItemID: 'item-1',
          productName: 'Producto A',
          sku: 'SKU-1',
          quantity: 1,
          unitPrice: 1190,
          lineTotal: 1190,
        },
      ],
      store: {
        storeID: 'store-1',
        tenantID: 'tenant-1',
        rut: '76123456-7',
        name: 'Tienda Demo',
        location: 'Santiago',
      },
    };
    ctx = createManagerMock({ sale });
    dataSource.transaction.mockImplementation((cb) => cb(ctx.manager));
    dteService.create.mockResolvedValue({
      dteDocumentID: 'dte-9',
      TOKEN: 'token-9',
      FOLIO: 999,
      STATUS: DteDocumentStatus.EMITIDO,
    });
    const service = createService();

    const result = await service.convert('sale-1', 'store-1');

    expect(dteMapperService.mapSaleToDte).toHaveBeenCalledWith(
      expect.objectContaining({
        saleID: 'sale-1',
        saleType: SaleType.NOTA_VENTA,
      }),
      { documentType: 33 },
    );
    expect(dteService.create).toHaveBeenCalledWith(
      'store-1',
      'sale-1',
      {},
      { reserveStock: false, saleID: 'sale-1' },
    );
    expect(ctx.sale()).toMatchObject({
      status: SaleStatus.CONVERTIDA,
      dteDocumentID: 'dte-9',
      folio: 999,
    });
    expect(financialMovementsService.removeSaleNote).toHaveBeenCalledWith(
      ctx.manager,
      'sale-1',
    );
    expect(result.dte).toMatchObject({
      dteDocumentID: 'dte-9',
      STATUS: DteDocumentStatus.EMITIDO,
    });
  });

  it('is idempotent when the nota de venta is already converted', async () => {
    const sale = {
      saleID: 'sale-1',
      storeID: 'store-1',
      tenantID: 'tenant-1',
      saleType: SaleType.NOTA_VENTA,
      status: SaleStatus.CONVERTIDA,
      total: 1190,
      dteDocument: {
        dteDocumentID: 'dte-1',
        token: 'token-1',
        folio: 123,
        status: DteDocumentStatus.EMITIDO,
        saleID: 'sale-1',
      },
    };
    ctx = createManagerMock({ sale });
    dataSource.transaction.mockImplementation((cb) => cb(ctx.manager));
    const service = createService();

    const result = await service.convert('sale-1', 'store-1');

    expect(dteService.create).not.toHaveBeenCalled();
    expect(result.dte).toMatchObject({
      dteDocumentID: 'dte-1',
      STATUS: DteDocumentStatus.EMITIDO,
    });
  });
});
