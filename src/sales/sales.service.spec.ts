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
import { InventoryService } from '../inventory/inventory.service';
import { DispatchGuide } from '../dispatch-guides/entities/dispatch-guide.entity';
import {
  DteDocument,
  DteDocumentPaymentType,
  DteDocumentStatus,
} from '../dte/entities/dte-document.entity';

function createManagerMock(
  initial: {
    sale?: any;
    folioCounter?: Partial<SaleFolioCounter> | null;
    stock?: number;
    storeHasOpenfacturaKey?: boolean;
    dispatchGuides?: any[];
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
    hasOpenfacturaKey: initial.storeHasOpenfacturaKey ?? true,
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
  const dispatchGuides: any[] = initial.dispatchGuides ?? [];

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
    createQueryBuilder: jest.fn((entity: unknown) => {
      if (entity === StoreProduct) {
        return {
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          setLock: jest.fn().mockReturnThis(),
          getOne: jest.fn(async () => storeProduct),
        };
      }
      return {};
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
      if (entity === DispatchGuide) {
        return {
          find: jest.fn(async () => dispatchGuides),
        };
      }
      return {};
    }),
  };

  return {
    manager,
    storeProduct,
    sale: () => sale,
    savedSales,
    savedItems,
    dispatchGuides,
  };
}

describe('SalesService', () => {
  const pricingService = {
    calculateCart: jest.fn(),
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
    pricingService.calculateCart.mockImplementation(
      async (input: { items?: Array<{ quantity?: number }> }) => {
        const quantity = input.items?.[0]?.quantity ?? 1;
        return {
          items: [
            {
              storeProductID: 'sp-1',
              variationID: 'var-1',
              productID: 'product-1',
              productName: 'Producto A',
              sku: 'SKU-1',
              quantity,
              finalUnitPrice: 1190,
              unitCost: 400,
              lineTotal: 1190 * quantity,
              basePrice: 1190 * quantity,
              discountsApplied: [],
              breakdown: [],
            },
          ],
          totals: {
            subtotal: 1190 * quantity,
            discount: 0,
            total: 1190 * quantity,
          },
          pricingContext: { storeID: 'store-1' },
        };
      },
    );
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
      new InventoryService(undefined as any),
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
      subtotal: 1190,
      discount: 0,
      total: 1190,
      netTotal: 1000,
      taxTotal: 190,
      cogsTotal: 400,
    });
    expect(pricingService.calculateCart).toHaveBeenCalledTimes(1);
    expect(pricingService.calculateCart.mock.calls[0][0]).not.toHaveProperty(
      'manualDiscount',
    );
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

  it('forwards a manual discount to the pricing engine with the authenticated user', async () => {
    const service = createService();
    const dto = { ...notaVentaDto(), manualDiscount: 10 };

    await service.create('store-1', undefined, dto as any, 'user-1');

    expect(pricingService.calculateCart).toHaveBeenCalledWith(
      expect.objectContaining({
        userID: 'user-1',
        manualDiscount: 10,
      }),
    );
  });

  it('persists automatic offer discounts from calculatePrice without manual discount', async () => {
    pricingService.calculateCart.mockResolvedValue({
      items: [
        {
          storeProductID: 'sp-1',
          variationID: 'var-1',
          productID: 'product-1',
          productName: 'Producto A',
          sku: 'SKU-1',
          quantity: 1,
          finalUnitPrice: 1071,
          unitCost: 400,
          lineTotal: 1071,
          basePrice: 1190,
          discountsApplied: [],
          breakdown: [],
        },
      ],
      totals: { subtotal: 1190, discount: 119, total: 1071 },
      pricingContext: { storeID: 'store-1' },
    });
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
      subtotal: 1190,
      discount: 119,
      total: 1071,
      netTotal: 900,
      taxTotal: 171,
      cogsTotal: 400,
    });
    expect(pricingService.calculateCart).toHaveBeenCalledTimes(1);
    expect(pricingService.calculateCart.mock.calls[0][0]).not.toHaveProperty(
      'manualDiscount',
    );
    expect(ctx.savedItems[0]).toMatchObject({
      storeProductID: 'sp-1',
      quantity: 1,
      unitPrice: 1071,
      unitCost: 400,
      lineTotal: 1071,
    });
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
      {
        reserveStock: true,
        paymentType: DteDocumentPaymentType.CREDIT,
      },
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

  it('emits a factura referencing dispatch guides without reserving stock and persists the references', async () => {
    ctx = createManagerMock({
      dispatchGuides: [
        {
          dispatchGuideID: 'dg-1',
          storeID: 'store-1',
          status: 'EMITIDA',
          folio: 100,
          issueDate: new Date('2026-08-25T00:00:00.000Z'),
          items: [
            {
              variationID: 'var-1',
              quantity: 1,
            },
          ],
        },
      ],
    });
    dataSource.transaction.mockImplementation((cb) => cb(ctx.manager));
    const service = createService();
    const dto = {
      saleType: SaleType.FACTURA,
      paymentType: SalePaymentType.CASH,
      receiver: { rut: '66666666-6', name: 'Cliente SpA' },
      items: [{ storeProductID: 'sp-1', quantity: 1 }],
      dispatchGuideIDs: ['dg-1'],
    };

    const result = await service.create('store-1', undefined, dto as any);

    expect(dteMapperService.mapSaleToDte).toHaveBeenCalledWith(
      expect.anything(),
      {
        documentType: 33,
        references: [
          {
            NroLinRef: 1,
            TpoDocRef: 52,
            FolioRef: 100,
            FchRef: '2026-08-25',
            RazonRef: 'Guía de despacho',
          },
        ],
      },
    );
    expect(dteService.create).toHaveBeenCalledWith(
      'store-1',
      undefined,
      {},
      {
        reserveStock: false,
        cogsTotalOverride: 400,
        paymentType: DteDocumentPaymentType.CASH,
      },
    );
    expect(ctx.storeProduct.stock).toBe(10);
    expect(ctx.sale()).toMatchObject({
      saleType: SaleType.FACTURA,
      dteDocumentID: 'dte-1',
    });
    expect(
      ctx.savedSales.some(
        (record) =>
          (record as { dteDocumentID?: string }).dteDocumentID === 'dte-1',
      ),
    ).toBe(true);
    expect(result.dte).toMatchObject({
      dteDocumentID: 'dte-1',
      STATUS: DteDocumentStatus.EMITIDO,
    });
  });

  it('rejects a sale when dispatch guide coverage is insufficient', async () => {
    ctx = createManagerMock({
      dispatchGuides: [
        {
          dispatchGuideID: 'dg-1',
          storeID: 'store-1',
          status: 'EMITIDA',
          folio: 100,
          issueDate: new Date('2026-08-25T00:00:00.000Z'),
          items: [
            {
              variationID: 'var-1',
              quantity: 1,
            },
          ],
        },
      ],
    });
    dataSource.transaction.mockImplementation((cb) => cb(ctx.manager));
    const service = createService();
    const dto = {
      saleType: SaleType.FACTURA,
      paymentType: SalePaymentType.CASH,
      receiver: { rut: '66666666-6', name: 'Cliente SpA' },
      items: [{ storeProductID: 'sp-1', quantity: 2 }],
      dispatchGuideIDs: ['dg-1'],
    };

    await expect(
      service.create('store-1', undefined, dto as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(dteService.create).not.toHaveBeenCalled();
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
      {
        reserveStock: false,
        saleID: 'sale-1',
        paymentType: DteDocumentPaymentType.CASH,
      },
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

  describe('hasOpenfacturaKey validation', () => {
    it('rejects BOLETA creation if store does not have openfactura key configured', async () => {
      ctx = createManagerMock({ storeHasOpenfacturaKey: false });
      dataSource.transaction.mockImplementation((cb) => cb(ctx.manager));
      const service = createService();

      const dto = {
        saleType: SaleType.BOLETA,
        paymentType: SalePaymentType.CASH,
        items: [{ storeProductID: 'sp-1', quantity: 1 }],
      };

      await expect(
        service.create('store-1', undefined, dto as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects FACTURA creation if store does not have openfactura key configured', async () => {
      ctx = createManagerMock({ storeHasOpenfacturaKey: false });
      dataSource.transaction.mockImplementation((cb) => cb(ctx.manager));
      const service = createService();

      const dto = {
        saleType: SaleType.FACTURA,
        paymentType: SalePaymentType.CASH,
        receiver: { rut: '76123456-7', name: 'Empresa SpA' },
        items: [{ storeProductID: 'sp-1', quantity: 1 }],
      };

      await expect(
        service.create('store-1', undefined, dto as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows NOTA_VENTA creation even if store has hasOpenfacturaKey false', async () => {
      ctx = createManagerMock({ storeHasOpenfacturaKey: false });
      dataSource.transaction.mockImplementation((cb) => cb(ctx.manager));
      const service = createService();

      const dto = {
        saleType: SaleType.NOTA_VENTA,
        paymentType: SalePaymentType.CASH,
        items: [{ storeProductID: 'sp-1', quantity: 1 }],
      };

      const result = await service.create('store-1', undefined, dto as any);
      expect(result.sale.saleType).toBe(SaleType.NOTA_VENTA);
      expect(result.sale.status).toBe(SaleStatus.EMITIDA);
    });

    it('rejects conversion of NOTA_VENTA to DTE if store does not have openfactura key configured', async () => {
      const sale = {
        saleID: 'sale-1',
        storeID: 'store-1',
        tenantID: 'tenant-1',
        saleType: SaleType.NOTA_VENTA,
        status: SaleStatus.EMITIDA,
        total: 1190,
        paymentType: SalePaymentType.CASH,
        items: [
          {
            storeProductID: 'sp-1',
            quantity: 1,
            variationID: 'var-1',
            sku: 'SKU-1',
            productName: 'Producto A',
            unitPrice: 1190,
            lineTotal: 1190,
          },
        ],
      };
      ctx = createManagerMock({ sale, storeHasOpenfacturaKey: false });
      dataSource.transaction.mockImplementation((cb) => cb(ctx.manager));
      const service = createService();

      await expect(service.convert('sale-1', 'store-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
