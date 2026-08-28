import { BadGatewayException, BadRequestException } from '@nestjs/common';
import { DispatchGuidesService } from './dispatch-guides.service';
import {
  DispatchGuide,
  DispatchGuideStatus,
} from './entities/dispatch-guide.entity';
import { DteDocumentStatus } from '../dte/entities/dte-document.entity';
import { InventoryMovementReason } from '../inventory/entities/inventory-movement.entity';
import { Store } from '../stores/entities/store.entity';
import { StoreProduct } from '../relations/storeproduct/entities/storeproduct.entity';

function createContext() {
  const store = {
    storeID: 'store-1',
    tenantID: 'tenant-1',
    rut: '76123456-7',
    name: 'Tienda Demo',
    businessName: 'Tienda Demo SpA',
    hasOpenfacturaKey: true,
  };
  const storeProduct = {
    storeProductID: 'sp-1',
    tenantID: 'tenant-1',
    variation: {
      variationID: 'var-1',
      sku: 'SKU-1',
      product: { name: 'Producto A' },
    },
  };

  let guideState: Partial<DispatchGuide> = {
    dispatchGuideID: 'dg-1',
    tenantID: 'tenant-1',
    storeID: 'store-1',
    userID: 'user-1',
    status: DispatchGuideStatus.PENDIENTE,
    folio: null,
    dteDocumentID: null,
    dteDocument: null,
    idempotencyKey: 'idem-1',
    issueDate: new Date('2026-08-25T00:00:00.000Z'),
    indTraslado: '1',
    includePrices: true,
    receiver: {
      rut: '76123456-7',
      name: 'Cliente SpA',
      address: 'Av. Providencia 1234',
      city: 'Providencia',
    },
    destination: { address: 'Av. Providencia 1234', city: 'Providencia' },
    transport: null,
    subtotal: 2380,
    discount: 0,
    netTotal: 2000,
    taxTotal: 380,
    total: 2380,
    cogsTotal: 800,
    payloadRaw: { response: ['FOLIO'] },
    errorDetail: null,
    items: [
      {
        dispatchGuideItemID: 'dgi-1',
        tenantID: 'tenant-1',
        dispatchGuideID: 'dg-1',
        storeProductID: 'sp-1',
        variationID: 'var-1',
        productName: 'Producto A',
        sku: 'SKU-1',
        quantity: 2,
        unitPrice: 1190,
        unitCost: 400,
        lineTotal: 2380,
      },
    ] as any,
    references: [] as any,
    createdAt: new Date('2026-08-25T00:00:00.000Z'),
    updatedAt: new Date('2026-08-25T00:00:00.000Z'),
  };

  const saved: unknown[] = [];
  let referenceCount = 0;

  const manager: any = {
    findOne: jest.fn(async (entity: unknown, options?: unknown) => {
      const where = (options as { where?: Record<string, unknown> } | undefined)
        ?.where;
      if (entity === DispatchGuide) {
        if (where?.idempotencyKey) return null;
        if (where?.dispatchGuideID) return guideState;
        return guideState;
      }
      if (entity === Store) return store;
      if (entity === StoreProduct) return storeProduct;
      return null;
    }),
    getRepository: jest.fn((entity: unknown) => {
      if (entity === DispatchGuide) {
        return {
          findOne: (options?: unknown) =>
            manager.findOne(DispatchGuide, options),
          find: jest.fn(async (options?: unknown) => {
            const where = (options as { where?: unknown } | undefined)?.where;
            if (
              Array.isArray(where) ||
              (where as { dteDocumentID?: string } | undefined)
                ?.dteDocumentID ||
              (where as { idempotencyKey?: string } | undefined)?.idempotencyKey
            ) {
              return [guideState];
            }
            return [];
          }),
        };
      }
      if (entity === StoreProduct) {
        return {
          find: jest.fn(async () => [storeProduct]),
        };
      }
      return {
        count: jest.fn(async () => referenceCount),
      };
    }),
    create: jest.fn((_entity: unknown, values: object) => ({ ...values })),
    save: jest.fn(async (entity: unknown) => {
      const record = entity as Record<string, unknown>;
      if (record.dispatchGuideID) {
        Object.assign(guideState, record);
        guideState = { ...guideState };
      }
      saved.push(entity);
      return entity;
    }),
    query: jest.fn().mockResolvedValue(undefined),
  };

  const pricingService = {
    calculateCart: jest.fn().mockResolvedValue({
      items: [
        {
          storeProductID: 'sp-1',
          variationID: 'var-1',
          productID: 'product-1',
          productName: 'Producto A',
          sku: 'SKU-1',
          quantity: 2,
          baseUnitPrice: 1190,
          unitCost: 400,
          basePrice: 2380,
          finalUnitPrice: 1190,
          lineTotal: 2380,
          discountsApplied: [],
          breakdown: [],
        },
      ],
      totals: { subtotal: 2380, discount: 0, total: 2380 },
      pricingContext: { storeID: 'store-1' },
    }),
  };
  const dteService = {
    create: jest.fn(),
    reconcile: jest.fn(),
    registerFinalizedListener: jest.fn(),
    findByIdempotencyKey: jest.fn(),
  };
  const mapper = {
    mapDispatchGuideToDte: jest.fn().mockReturnValue({
      response: ['FOLIO'],
      dte: {
        Encabezado: {
          IdDoc: { TipoDTE: 52, Folio: 0 },
        },
        Detalle: [],
      },
    }),
  };
  const inventoryService = {
    revertReservedStock: jest.fn().mockResolvedValue(undefined),
  };
  const storesService = {
    resolveOpenfacturaKey: jest.fn().mockResolvedValue('apikey'),
  };
  const openfacturaClient = {
    anularDte52: jest.fn().mockResolvedValue({ ok: true, payload: {} }),
  };
  const dataSource = {
    transaction: jest.fn(async (cb: (manager: unknown) => Promise<unknown>) =>
      cb(manager),
    ),
  };

  const service = new DispatchGuidesService(
    {} as any,
    {} as any,
    {} as any,
    dataSource as any,
    pricingService as any,
    dteService as any,
    mapper as any,
    inventoryService as any,
    storesService as any,
    openfacturaClient as any,
  );

  return {
    manager,
    service,
    store,
    guide: () => guideState,
    setGuide: (patch: Partial<DispatchGuide>) => {
      Object.assign(guideState, patch);
    },
    setReferenceCount: (count: number) => {
      referenceCount = count;
    },
    saved,
    pricingService,
    dteService,
    mapper,
    inventoryService,
    storesService,
    openfacturaClient,
  };
}

function emittedDteResponse(overrides: Record<string, unknown> = {}) {
  return {
    dteDocumentID: 'dte-1',
    TOKEN: 'token-1',
    FOLIO: 100,
    STATUS: DteDocumentStatus.EMITIDO,
    ...overrides,
  };
}

describe('DispatchGuidesService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function validDto() {
    return {
      items: [{ storeProductID: 'sp-1', quantity: 2 }],
      receiver: {
        rut: '76123456-7',
        name: 'Cliente SpA',
        address: 'Av. Providencia 1234',
        city: 'Providencia',
      },
      destination: { address: 'Av. Providencia 1234', city: 'Providencia' },
    };
  }

  it('crea la guía PENDIENTE, persiste ítems y emite DTE 52 reservando stock', async () => {
    const ctx = createContext();
    ctx.dteService.create.mockImplementation(async () => {
      ctx.setGuide({
        status: DispatchGuideStatus.EMITIDA,
        folio: 100,
        dteDocumentID: 'dte-1',
      });
      return emittedDteResponse();
    });

    const result = await ctx.service.create(
      'store-1',
      'idem-1',
      validDto() as any,
      'user-1',
    );

    expect(ctx.guide().status).toBe(DispatchGuideStatus.EMITIDA);
    expect(ctx.guide().folio).toBe(100);
    expect(ctx.guide().dteDocumentID).toBe('dte-1');
    expect(
      ctx.saved.some(
        (record) => (record as { dispatchGuideID?: string }).dispatchGuideID,
      ),
    ).toBe(true);
    expect(ctx.dteService.create).toHaveBeenCalledWith(
      'store-1',
      'idem-1',
      expect.objectContaining({
        dte: expect.objectContaining({
          Encabezado: expect.objectContaining({
            IdDoc: expect.objectContaining({ TipoDTE: 52 }),
          }),
        }),
      }),
      {
        reserveStock: true,
        reserveReason: InventoryMovementReason.DISPATCH_GUIDE,
      },
    );
    expect(result.dispatchGuide.status).toBe(DispatchGuideStatus.EMITIDA);
    expect(result.dte).toMatchObject({ FOLIO: 100 });
  });

  it('mantiene PENDIENTE y guarda errorDetail cuando la emisión falla', async () => {
    const ctx = createContext();
    ctx.dteService.create.mockRejectedValue(
      new BadGatewayException('Openfactura no pudo emitir'),
    );

    const result = await ctx.service.create(
      'store-1',
      'idem-1',
      validDto() as any,
    );

    expect(ctx.guide().status).toBe(DispatchGuideStatus.PENDIENTE);
    expect(ctx.guide().errorDetail).toContain('Openfactura no pudo emitir');
    expect(result.dispatchGuide.status).toBe(DispatchGuideStatus.PENDIENTE);
    expect(ctx.inventoryService.revertReservedStock).not.toHaveBeenCalled();
  });

  it('es idempotente por Idempotency-Key y devuelve la guía existente', async () => {
    const ctx = createContext();
    ctx.setGuide({ status: DispatchGuideStatus.EMITIDA, folio: 100 });
    ctx.manager.findOne.mockImplementation(
      async (entity: unknown, options?: unknown) => {
        const where = (
          options as { where?: Record<string, unknown> } | undefined
        )?.where;
        if (entity === DispatchGuide && where?.idempotencyKey === 'idem-1') {
          return ctx.guide();
        }
        if (entity === DispatchGuide) return ctx.guide();
        return null;
      },
    );

    const result = await ctx.service.create(
      'store-1',
      'idem-1',
      validDto() as any,
    );

    expect(result.dispatchGuide.dispatchGuideID).toBe('dg-1');
    expect(ctx.dteService.create).not.toHaveBeenCalled();
  });

  it('crea una guía sin precios omitiendo PricingService y con montos en cero', async () => {
    const ctx = createContext();
    ctx.dteService.create.mockImplementation(async () => {
      ctx.setGuide({
        status: DispatchGuideStatus.EMITIDA,
        folio: 101,
        dteDocumentID: 'dte-2',
      });
      return emittedDteResponse({ FOLIO: 101, dteDocumentID: 'dte-2' });
    });

    const result = await ctx.service.create('store-1', 'idem-no-prices', {
      ...validDto(),
      includePrices: false,
      indTraslado: '5',
    } as any);

    expect(ctx.pricingService.calculateCart).not.toHaveBeenCalled();
    expect(ctx.guide().includePrices).toBe(false);
    expect(ctx.guide().indTraslado).toBe('5');
    expect(
      ctx.saved
        .flatMap((record) => (Array.isArray(record) ? record : [record]))
        .some(
          (record) =>
            (record as { unitPrice?: number }).unitPrice === 0 &&
            (record as { lineTotal?: number }).lineTotal === 0,
        ),
    ).toBe(true);
    expect(result.dispatchGuide.status).toBe(DispatchGuideStatus.EMITIDA);
  });

  it('finaliza vía listener de forma idempotente', async () => {
    const ctx = createContext();
    let listener:
      | ((manager: unknown, document: unknown) => Promise<void>)
      | undefined;
    ctx.dteService.registerFinalizedListener.mockImplementation(
      (fn: typeof listener) => {
        listener = fn;
      },
    );
    ctx.service.onModuleInit();

    await listener!(ctx.manager, {
      status: DteDocumentStatus.EMITIDO,
      dteDocumentID: 'dte-1',
      folio: 123,
      idempotencyKey: 'idem-1',
    });
    expect(ctx.guide().status).toBe(DispatchGuideStatus.EMITIDA);
    expect(ctx.guide().folio).toBe(123);
    expect(ctx.guide().dteDocumentID).toBe('dte-1');

    const savesAfterFirst = ctx.saved.length;
    await listener!(ctx.manager, {
      status: DteDocumentStatus.EMITIDO,
      dteDocumentID: 'dte-1',
      folio: 123,
      idempotencyKey: 'idem-1',
    });
    expect(ctx.saved.length).toBe(savesAfterFirst);
  });

  it('anula desde EMITIDA: llama anularDTE52 y revierte stock sin ledger', async () => {
    const ctx = createContext();
    ctx.setGuide({
      status: DispatchGuideStatus.EMITIDA,
      folio: 100,
      dteDocumentID: 'dte-1',
    });

    const result = await ctx.service.anular('dg-1', 'store-1');

    expect(ctx.openfacturaClient.anularDte52).toHaveBeenCalledWith(
      'apikey',
      100,
      '2026-08-25',
    );
    expect(ctx.guide().status).toBe(DispatchGuideStatus.ANULADA);
    expect(ctx.inventoryService.revertReservedStock).toHaveBeenCalledWith(
      ctx.manager,
      'store-1',
      [{ variationID: 'var-1', QtyItem: 2 }],
      'dte-1',
      'tenant-1',
      expect.any(Function),
    );
    expect(result.dispatchGuide.status).toBe(DispatchGuideStatus.ANULADA);
  });

  it('deja ANULACION_PENDIENTE y lanza BadGateway cuando Openfactura falla', async () => {
    const ctx = createContext();
    ctx.setGuide({
      status: DispatchGuideStatus.EMITIDA,
      folio: 100,
      dteDocumentID: 'dte-1',
    });
    ctx.openfacturaClient.anularDte52.mockResolvedValue({
      ok: false,
      errorDetail: 'Openfactura respondió con estado 500',
    });

    await expect(ctx.service.anular('dg-1', 'store-1')).rejects.toThrow(
      BadGatewayException,
    );
    expect(ctx.guide().status).toBe(DispatchGuideStatus.ANULACION_PENDIENTE);
    expect(ctx.guide().errorDetail).toContain('Openfactura respondió');
    expect(ctx.inventoryService.revertReservedStock).not.toHaveBeenCalled();
  });

  it('reconcilia una ANULACION_PENDIENTE completando la anulación y revirtiendo stock', async () => {
    const ctx = createContext();
    ctx.setGuide({
      status: DispatchGuideStatus.ANULACION_PENDIENTE,
      folio: 100,
      dteDocumentID: 'dte-1',
      errorDetail: 'Timeout',
    });

    const result = await ctx.service.reconcile('dg-1', 'store-1');

    expect(ctx.openfacturaClient.anularDte52).toHaveBeenCalledWith(
      'apikey',
      100,
      '2026-08-25',
    );
    expect(ctx.guide().status).toBe(DispatchGuideStatus.ANULADA);
    expect(ctx.guide().errorDetail).toBeNull();
    expect(ctx.inventoryService.revertReservedStock).toHaveBeenCalled();
    expect(result.dispatchGuide.status).toBe(DispatchGuideStatus.ANULADA);
  });

  it('mantiene ANULACION_PENDIENTE cuando reconcile de anulación vuelve a fallar', async () => {
    const ctx = createContext();
    ctx.setGuide({
      status: DispatchGuideStatus.ANULACION_PENDIENTE,
      folio: 100,
      dteDocumentID: 'dte-1',
    });
    ctx.openfacturaClient.anularDte52.mockResolvedValue({
      ok: false,
      errorDetail: 'Timeout llamando a Openfactura',
    });

    await expect(ctx.service.reconcile('dg-1', 'store-1')).rejects.toThrow(
      BadGatewayException,
    );
    expect(ctx.guide().status).toBe(DispatchGuideStatus.ANULACION_PENDIENTE);
    expect(ctx.inventoryService.revertReservedStock).not.toHaveBeenCalled();
  });

  it('bloquea la anulación cuando la guía ya está referenciada', async () => {
    const ctx = createContext();
    ctx.setGuide({
      status: DispatchGuideStatus.EMITIDA,
      folio: 100,
      dteDocumentID: 'dte-1',
    });
    ctx.setReferenceCount(1);

    await expect(ctx.service.anular('dg-1', 'store-1')).rejects.toThrow(
      BadRequestException,
    );
    expect(ctx.openfacturaClient.anularDte52).not.toHaveBeenCalled();
    expect(ctx.guide().status).toBe(DispatchGuideStatus.EMITIDA);
  });

  it('rechaza anular una guía que no está EMITIDA', async () => {
    const ctx = createContext();
    await expect(ctx.service.anular('dg-1', 'store-1')).rejects.toThrow(
      BadRequestException,
    );
    expect(ctx.openfacturaClient.anularDte52).not.toHaveBeenCalled();
  });

  it('reconcilia reintentando la emisión con el payload persistido', async () => {
    const ctx = createContext();
    ctx.dteService.create.mockImplementation(async () => {
      ctx.setGuide({
        status: DispatchGuideStatus.EMITIDA,
        folio: 200,
        dteDocumentID: 'dte-2',
      });
      return emittedDteResponse({ FOLIO: 200, dteDocumentID: 'dte-2' });
    });

    const result = await ctx.service.reconcile('dg-1', 'store-1');

    expect(ctx.dteService.create).toHaveBeenCalledWith(
      'store-1',
      'idem-1',
      expect.objectContaining({ response: ['FOLIO'] }),
      {
        reserveStock: true,
        reserveReason: InventoryMovementReason.DISPATCH_GUIDE,
      },
    );
    expect(ctx.guide().status).toBe(DispatchGuideStatus.EMITIDA);
    expect(result.dispatchGuide.status).toBe(DispatchGuideStatus.EMITIDA);
  });

  it('no admite reconciliar una guía ANULADA', async () => {
    const ctx = createContext();
    ctx.setGuide({ status: DispatchGuideStatus.ANULADA });
    await expect(ctx.service.reconcile('dg-1', 'store-1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('el listener ignora guías en ANULACION_PENDIENTE', async () => {
    const ctx = createContext();
    ctx.setGuide({
      status: DispatchGuideStatus.ANULACION_PENDIENTE,
      folio: 100,
      dteDocumentID: 'dte-1',
    });
    let listener:
      | ((manager: unknown, document: unknown) => Promise<void>)
      | undefined;
    ctx.dteService.registerFinalizedListener.mockImplementation(
      (fn: typeof listener) => {
        listener = fn;
      },
    );
    ctx.service.onModuleInit();

    const savesBefore = ctx.saved.length;
    await listener!(ctx.manager, {
      status: DteDocumentStatus.EMITIDO,
      dteDocumentID: 'dte-1',
      folio: 100,
      idempotencyKey: 'idem-1',
    });

    expect(ctx.guide().status).toBe(DispatchGuideStatus.ANULACION_PENDIENTE);
    expect(ctx.saved.length).toBe(savesBefore);
  });
});
