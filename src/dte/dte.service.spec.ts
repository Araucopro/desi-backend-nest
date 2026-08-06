import {
  BadGatewayException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { DteService } from './dte.service';
import { DteDocument, DteDocumentStatus } from './entities/dte-document.entity';
import { Store } from '../stores/entities/store.entity';
import { Product } from '../products/entities/product.entity';
import { ProductVariation } from '../products/entities/product-variation.entity';
import { StoreProduct } from '../relations/storeproduct/entities/storeproduct.entity';
import {
  PurchaseOrder,
  PurchaseOrderCommercialStatus,
} from '../purchase-orders/entities/purchase-order.entity';

function createDteDto(
  overrides: {
    fmaPago?: string;
    quantity?: number;
    noCode?: boolean;
  } = {},
) {
  return {
    purchaseOrderID: undefined,
    response: ['FOLIO'],
    dte: {
      Encabezado: {
        IdDoc: {
          TipoDTE: 33,
          Folio: 100,
          FchEmis: '2026-01-15',
          FmaPago: overrides.fmaPago,
        },
        Emisor: {
          RUTEmisor: '76123456-7',
          RznSoc: 'Tienda Central',
        },
        Receptor: {
          RUTRecep: '1-9',
          RznSocRecep: 'Cliente',
        },
        Totales: {
          MntNeto: 1000,
          IVA: 190,
          MntTotal: 1190,
        },
      },
      Detalle: [
        {
          NroLinDet: 1,
          NmbItem: 'Producto A',
          QtyItem: overrides.quantity ?? 2,
          PrcItem: 500,
          MontoItem: 1000,
          ...(overrides.noCode ? {} : { CdgItem: { VlrCodigo: 'SKU-1' } }),
        },
      ],
    },
    customer: undefined,
    customizePage: undefined,
    selfService: { issueBoleta: false, allowFactura: true },
  };
}

function createMockManager(
  options: {
    existingDocument?: Partial<DteDocument> | null;
    storeProductStock?: number;
    storeProductCost?: number;
    saveDocumentError?: unknown;
    documentAfterConflict?: Partial<DteDocument> | null;
    resolveByName?: boolean;
    purchaseOrder?: Partial<PurchaseOrder> | null;
  } = {},
) {
  const storeProduct = {
    storeProductID: 'sp-1',
    stock: options.storeProductStock ?? 10,
    priceCost: options.storeProductCost ?? 120,
  };
  const variation = {
    variationID: 'var-1',
    sku: 'SKU-1',
    product: { name: 'Producto A' },
  };
  const product = {
    productID: 'product-1',
    name: 'Producto A',
    variations: [{ ...variation, product: undefined }],
  };
  let document: Partial<DteDocument> | null = options.existingDocument ?? null;
  let documentSaveAttempted = false;

  return {
    findOne: jest.fn(async (entity: unknown, _criteria?: unknown) => {
      if (entity === DteDocument) {
        if (options.saveDocumentError && documentSaveAttempted) {
          return options.documentAfterConflict ?? null;
        }
        return document;
      }
      if (entity === Store) {
        return {
          storeID: 'store-1',
          tenantID: 'tenant-1',
          rut: '76123456-7',
          name: 'Tienda Central',
          location: null,
        };
      }
      if (entity === ProductVariation) {
        return options.resolveByName ? null : variation;
      }
      if (entity === Product) {
        return options.resolveByName ? product : null;
      }
      if (entity === StoreProduct) {
        return storeProduct;
      }
      if (entity === PurchaseOrder) {
        return options.purchaseOrder ?? null;
      }
      return null;
    }),
    find: jest.fn().mockResolvedValue([]),
    create: jest.fn((_entity: unknown, values: object) => ({
      ...values,
      dteDocumentID: 'dte-1',
    })),
    save: jest.fn(async (entity: unknown) => {
      const candidate = entity as Partial<DteDocument> & {
        dteDocumentID?: string;
        status?: DteDocumentStatus;
        payloadRaw?: unknown;
      };
      if (
        candidate?.dteDocumentID === 'dte-1' &&
        candidate.status !== undefined &&
        candidate.payloadRaw !== undefined
      ) {
        if (options.saveDocumentError && !documentSaveAttempted) {
          documentSaveAttempted = true;
          throw options.saveDocumentError;
        }
        document = candidate;
      }
      return entity;
    }),
    query: jest.fn().mockResolvedValue(undefined),
  };
}

describe('DteService', () => {
  const mockDteDocumentRepository = { findOne: jest.fn() };
  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: unknown) =>
      key === 'OPENFACTURA_APIKEY' ? 'apikey-test' : defaultValue,
    ),
  };
  const mockFinancialMovementsService = {
    recordDte: jest.fn().mockResolvedValue(undefined),
    recordPurchaseOrder: jest.fn().mockResolvedValue(undefined),
    removePurchaseOrder: jest.fn().mockResolvedValue(undefined),
    recordExpense: jest.fn().mockResolvedValue(undefined),
    removeExpense: jest.fn().mockResolvedValue(undefined),
  };

  let dataSource: { transaction: jest.Mock };
  let manager: ReturnType<typeof createMockManager>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDteDocumentRepository.findOne.mockResolvedValue(null);
    manager = createMockManager();
    dataSource = { transaction: jest.fn((cb) => cb(manager)) };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      text: async () =>
        JSON.stringify({ TOKEN: 'token-1', FOLIO: 200, status: 'EMITIDO' }),
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function createService() {
    return new DteService(
      mockDteDocumentRepository as any,
      mockConfigService as any,
      dataSource as any,
      mockFinancialMovementsService as any,
    );
  }

  function findSavedDocument(status?: DteDocumentStatus) {
    return (manager.save.mock.calls as Array<[any]>).find(([entity]) => {
      if (
        entity?.dteDocumentID !== 'dte-1' ||
        entity?.payloadRaw === undefined
      ) {
        return false;
      }
      return status ? entity.status === status : true;
    })?.[0];
  }

  it('snapshots COGS from StoreProduct.priceCost and records the ledger on EMITIDO', async () => {
    const service = createService();

    const result = await service.create(
      'store-1',
      undefined,
      createDteDto() as any,
    );

    expect(result.FOLIO).toBe(200);
    expect(result.STATUS).toBe('EMITIDO');

    const savedDocument = findSavedDocument(DteDocumentStatus.EMITIDO);
    expect(savedDocument).toMatchObject({
      netTotal: 1000,
      taxTotal: 190,
      cogsTotal: 240,
      issueDate: new Date('2026-01-15T12:00:00'),
      status: 'EMITIDO',
    });
    expect(savedDocument.payloadNormalized.items[0]).toMatchObject({
      variationID: 'var-1',
      costPrice: 120,
      costTotal: 240,
    });
    expect(mockFinancialMovementsService.recordDte).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        dteDocumentID: 'dte-1',
        cogsTotal: 240,
        status: 'EMITIDO',
      }),
    );
  });

  it('marks ERROR and reverts stock without ledger when Openfactura returns status ERROR', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      text: async () =>
        JSON.stringify({ TOKEN: 'token-1', FOLIO: 200, status: 'ERROR' }),
    });

    const service = createService();
    await expect(
      service.create('store-1', undefined, createDteDto() as any),
    ).rejects.toBeInstanceOf(BadGatewayException);

    const savedDocument = findSavedDocument(DteDocumentStatus.ERROR);
    expect(savedDocument.status).toBe('ERROR');
    expect(savedDocument.errorDetail).toContain(
      'Openfactura reportó estado ERROR',
    );
    expect(mockFinancialMovementsService.recordDte).not.toHaveBeenCalled();
    expect(
      manager.save.mock.calls.some(([entity]) => {
        const saved = entity as { reason?: unknown; delta?: unknown };
        return saved?.reason === 'ADJUSTMENT' && saved?.delta === 2;
      }),
    ).toBe(true);
  });

  it('marks ERROR and reverts stock on HTTP 5xx without ledger', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({ message: 'boom' }),
    });

    const service = createService();
    await expect(
      service.create('store-1', undefined, createDteDto() as any),
    ).rejects.toBeInstanceOf(BadGatewayException);

    const savedDocument = findSavedDocument(DteDocumentStatus.ERROR);
    expect(savedDocument.status).toBe('ERROR');
    expect(savedDocument.errorDetail).toContain('estado 500');
    expect(mockFinancialMovementsService.recordDte).not.toHaveBeenCalled();
    expect(
      manager.save.mock.calls.some(([entity]) => {
        const saved = entity as { reason?: unknown; delta?: unknown };
        return saved?.reason === 'ADJUSTMENT' && saved?.delta === 2;
      }),
    ).toBe(true);
  });

  it('marks ERROR and reverts stock on timeout without ledger', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(
      Object.assign(new Error('aborted'), { name: 'AbortError' }),
    );

    const service = createService();
    await expect(
      service.create('store-1', undefined, createDteDto() as any),
    ).rejects.toBeInstanceOf(BadGatewayException);

    const savedDocument = findSavedDocument(DteDocumentStatus.ERROR);
    expect(savedDocument.status).toBe('ERROR');
    expect(savedDocument.errorDetail).toContain(
      'Timeout llamando a Openfactura',
    );
    expect(mockFinancialMovementsService.recordDte).not.toHaveBeenCalled();
    expect(
      manager.save.mock.calls.some(([entity]) => {
        const saved = entity as { reason?: unknown; delta?: unknown };
        return saved?.reason === 'ADJUSTMENT' && saved?.delta === 2;
      }),
    ).toBe(true);
  });

  it('rejects insufficient stock in Tx A without calling Openfactura', async () => {
    manager = createMockManager({ storeProductStock: 1 });
    dataSource.transaction.mockImplementation((cb) => cb(manager));

    const service = createService();
    await expect(
      service.create('store-1', undefined, createDteDto() as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('reuses an existing EMITIDO document by idempotency key', async () => {
    manager = createMockManager({
      existingDocument: {
        dteDocumentID: 'existing-dte',
        token: 'existing-token',
        folio: 111,
        status: DteDocumentStatus.EMITIDO,
      },
    });
    dataSource.transaction.mockImplementation((cb) => cb(manager));

    const service = createService();
    const result = await service.create(
      'store-1',
      'idem-1',
      createDteDto() as any,
    );

    expect(result.TOKEN).toBe('existing-token');
    expect(global.fetch).not.toHaveBeenCalled();
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(mockFinancialMovementsService.recordDte).not.toHaveBeenCalled();
  });

  it('reuses an existing EMITIDO document by purchaseOrderID', async () => {
    manager = createMockManager({
      existingDocument: {
        dteDocumentID: 'existing-dte',
        token: 'existing-token',
        folio: 222,
        status: DteDocumentStatus.EMITIDO,
        purchaseOrderID: 'po-1',
      },
    });
    dataSource.transaction.mockImplementation((cb) => cb(manager));

    const service = createService();
    const dto = createDteDto() as any;
    dto.purchaseOrderID = 'po-1';
    const result = await service.create('store-1', undefined, dto);

    expect(result.FOLIO).toBe(222);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('persists purchaseOrderID when a valid accepted PO is provided', async () => {
    manager = createMockManager({
      purchaseOrder: { status: PurchaseOrderCommercialStatus.ACEPTADO },
    });
    dataSource.transaction.mockImplementation((cb) => cb(manager));

    const service = createService();
    const dto = createDteDto() as any;
    dto.purchaseOrderID = 'po-1';
    await service.create('store-1', undefined, dto);

    expect(findSavedDocument(DteDocumentStatus.EMITIDO).purchaseOrderID).toBe(
      'po-1',
    );
  });

  it('resolves concurrent duplicates by purchaseOrderID without idempotency key', async () => {
    manager = createMockManager({
      purchaseOrder: { status: PurchaseOrderCommercialStatus.ACEPTADO },
      saveDocumentError: { code: '23505' },
      documentAfterConflict: {
        dteDocumentID: 'existing-dte',
        token: 'existing-token',
        folio: 555,
        status: DteDocumentStatus.EMITIDO,
        purchaseOrderID: 'po-1',
      },
    });
    dataSource.transaction.mockImplementation((cb) => cb(manager));

    const service = createService();
    const dto = createDteDto() as any;
    dto.purchaseOrderID = 'po-1';
    const result = await service.create('store-1', undefined, dto);

    expect(result.TOKEN).toBe('existing-token');
    expect(result.FOLIO).toBe(555);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(manager.query).toHaveBeenCalledWith(
      'ROLLBACK TO SAVEPOINT dte_document_insert',
    );
  });

  it('rejects a purchaseOrderID that belongs to another store', async () => {
    manager = createMockManager({ purchaseOrder: null });
    dataSource.transaction.mockImplementation((cb) => cb(manager));

    const service = createService();
    const dto = createDteDto() as any;
    dto.purchaseOrderID = 'po-1';

    await expect(service.create('store-1', undefined, dto)).rejects.toThrow(
      'no encontrada para esta tienda',
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it.each([
    [PurchaseOrderCommercialStatus.PENDIENTE],
    [PurchaseOrderCommercialStatus.ENVIADO],
    [PurchaseOrderCommercialStatus.RECHAZADO],
  ])('rejects a purchaseOrderID whose PO is in status %s', async (status) => {
    manager = createMockManager({
      purchaseOrder: { status },
    });
    dataSource.transaction.mockImplementation((cb) => cb(manager));

    const service = createService();
    const dto = createDteDto() as any;
    dto.purchaseOrderID = 'po-1';

    await expect(service.create('store-1', undefined, dto)).rejects.toThrow(
      'no está en estado Aceptado',
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('retries an ERROR document on the same row and keeps the original Idempotency-Key', async () => {
    manager = createMockManager({
      existingDocument: {
        dteDocumentID: 'dte-1',
        token: 'local-abc',
        folio: 111,
        status: DteDocumentStatus.ERROR,
        idempotencyKey: 'idem-orig',
        payloadNormalized: {
          items: [
            {
              variationID: 'var-1',
              QtyItem: 2,
            },
          ],
        },
      },
    });
    dataSource.transaction.mockImplementation((cb) => cb(manager));
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      text: async () =>
        JSON.stringify({ TOKEN: 'token-new', FOLIO: 300, status: 'EMITIDO' }),
    });

    const service = createService();
    const result = await service.create(
      'store-1',
      'idem-retry',
      createDteDto() as any,
    );

    expect(result.TOKEN).toBe('token-new');
    expect(result.FOLIO).toBe(300);
    expect((global.fetch as jest.Mock).mock.calls[0][1].headers).toMatchObject({
      'Idempotency-Key': 'idem-orig',
    });
    expect(findSavedDocument(DteDocumentStatus.EMITIDO).dteDocumentID).toBe(
      'dte-1',
    );
  });

  it('re-reads and returns the existing document on unique violation 23505', async () => {
    manager = createMockManager({
      saveDocumentError: { code: '23505' },
      documentAfterConflict: {
        dteDocumentID: 'existing-dte',
        token: 'existing-token',
        folio: 444,
        status: DteDocumentStatus.EMITIDO,
      },
    });
    dataSource.transaction.mockImplementation((cb) => cb(manager));

    const service = createService();
    const result = await service.create(
      'store-1',
      'idem-1',
      createDteDto() as any,
    );

    expect(result.TOKEN).toBe('existing-token');
    expect(global.fetch).not.toHaveBeenCalled();
    expect(manager.query).toHaveBeenCalledWith(
      'ROLLBACK TO SAVEPOINT dte_document_insert',
    );
  });

  it('maps FmaPago 2 to CREDIT before persisting', async () => {
    const service = createService();
    await service.create(
      'store-1',
      undefined,
      createDteDto({ fmaPago: '2' }) as any,
    );

    expect(findSavedDocument(DteDocumentStatus.EMITIDO).paymentType).toBe(
      'Credito',
    );
  });

  it('persists a masked apikey instead of the full secret', async () => {
    const service = createService();
    await service.create('store-1', undefined, createDteDto() as any);

    expect(findSavedDocument(DteDocumentStatus.EMITIDO).apikey).toBe(
      'apik...test',
    );
  });

  it('warns and resolves items by name when SKU is absent', async () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    manager = createMockManager({ resolveByName: true });
    dataSource.transaction.mockImplementation((cb) => cb(manager));

    const service = createService();
    await service.create(
      'store-1',
      undefined,
      createDteDto({ noCode: true }) as any,
    );

    expect(
      findSavedDocument(DteDocumentStatus.EMITIDO).payloadNormalized.items[0],
    ).toMatchObject({
      variationID: 'var-1',
      resolvedByName: true,
    });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Resolución de ítem por nombre'),
    );
  });

  it('reconciles a PENDIENTE document with a real token to EMITIDO and records the ledger', async () => {
    manager = createMockManager({
      existingDocument: {
        dteDocumentID: 'dte-1',
        token: 'real-token',
        folio: 100,
        status: DteDocumentStatus.PENDIENTE,
        payloadRaw: {},
        payloadNormalized: {
          items: [{ variationID: 'var-1', QtyItem: 2 }],
        },
      },
    });
    dataSource.transaction.mockImplementation((cb) => cb(manager));
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({ folio: 555 }),
    });

    const service = createService();
    const result = await service.reconcile('dte-1', 'store-1');

    expect(result.STATUS).toBe('EMITIDO');
    expect(result.FOLIO).toBe(555);
    expect(mockFinancialMovementsService.recordDte).toHaveBeenCalled();
  });

  it('reconciles PENDIENTE to ERROR when Openfactura no longer has the token', async () => {
    manager = createMockManager({
      existingDocument: {
        dteDocumentID: 'dte-1',
        token: 'real-token',
        folio: 100,
        status: DteDocumentStatus.PENDIENTE,
        payloadRaw: {},
        payloadNormalized: {
          items: [{ variationID: 'var-1', QtyItem: 2 }],
        },
      },
    });
    dataSource.transaction.mockImplementation((cb) => cb(manager));
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 404,
      headers: { get: () => 'application/json' },
      text: async () => '{}',
    });

    const service = createService();
    await expect(service.reconcile('dte-1', 'store-1')).rejects.toBeInstanceOf(
      BadGatewayException,
    );

    const savedDocument = findSavedDocument(DteDocumentStatus.ERROR);
    expect(savedDocument.status).toBe('ERROR');
    expect(savedDocument.errorDetail).toContain('estado 404');
    expect(mockFinancialMovementsService.recordDte).not.toHaveBeenCalled();
    expect(
      manager.save.mock.calls.some(([entity]) => {
        const saved = entity as { reason?: unknown; delta?: unknown };
        return saved?.reason === 'ADJUSTMENT' && saved?.delta === 2;
      }),
    ).toBe(true);
  });

  it('rejects reconcile when the document has no real Openfactura token', async () => {
    manager = createMockManager({
      existingDocument: {
        dteDocumentID: 'dte-1',
        token: 'local-abc',
        folio: 100,
        status: DteDocumentStatus.PENDIENTE,
        payloadRaw: {},
      },
    });
    dataSource.transaction.mockImplementation((cb) => cb(manager));

    const service = createService();
    await expect(service.reconcile('dte-1', 'store-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('supports reserveStock=false for nota de venta conversion without deducting stock', async () => {
    const service = createService();

    const result = await service.create(
      'store-1',
      'sale-1',
      createDteDto() as any,
      { reserveStock: false, saleID: 'sale-1' },
    );

    expect(result.FOLIO).toBe(200);
    expect(result.saleID).toBe('sale-1');
    expect(findSavedDocument(DteDocumentStatus.EMITIDO)).toMatchObject({
      saleID: 'sale-1',
      stockReserved: false,
    });
    expect(
      manager.save.mock.calls.some(([entity]) => {
        const saved = entity as { reason?: unknown };
        return saved?.reason === 'SALE';
      }),
    ).toBe(false);
    expect(
      manager.save.mock.calls.some(([entity]) => {
        const saved = entity as { stock?: unknown };
        return typeof saved?.stock === 'number' && saved.stock < 10;
      }),
    ).toBe(false);
  });

  it('does not revert stock when a reserveStock=false DTE ends in ERROR', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      text: async () =>
        JSON.stringify({ TOKEN: 'token-1', FOLIO: 200, status: 'ERROR' }),
    });

    const service = createService();
    await expect(
      service.create('store-1', 'sale-1', createDteDto() as any, {
        reserveStock: false,
        saleID: 'sale-1',
      }),
    ).rejects.toBeInstanceOf(BadGatewayException);

    expect(findSavedDocument(DteDocumentStatus.ERROR)).toMatchObject({
      saleID: 'sale-1',
      stockReserved: false,
    });
    expect(
      manager.save.mock.calls.some(([entity]) => {
        const saved = entity as { reason?: unknown };
        return saved?.reason === 'ADJUSTMENT';
      }),
    ).toBe(false);
  });
});
