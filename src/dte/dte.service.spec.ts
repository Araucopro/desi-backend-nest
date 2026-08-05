import { DteService } from './dte.service';
import { DteDocument } from './entities/dte-document.entity';
import { Store } from '../stores/entities/store.entity';
import { ProductVariation } from '../products/entities/product-variation.entity';
import { StoreProduct } from '../relations/storeproduct/entities/storeproduct.entity';

function createDteDto() {
  return {
    purchaseOrderID: undefined,
    response: ['FOLIO'],
    dte: {
      Encabezado: {
        IdDoc: {
          TipoDTE: 33,
          Folio: 100,
          FchEmis: '2026-01-15',
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
          QtyItem: 2,
          PrcItem: 500,
          MontoItem: 1000,
          CdgItem: { VlrCodigo: 'SKU-1' },
        },
      ],
    },
    customer: undefined,
    customizePage: undefined,
    selfService: { issueBoleta: false, allowFactura: true },
  };
}

function createMockManager() {
  return {
    findOne: jest.fn().mockImplementation(async (entity: unknown) => {
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
        return {
          variationID: 'var-1',
          sku: 'SKU-1',
          product: { name: 'Producto A' },
        };
      }
      if (entity === StoreProduct) {
        return {
          storeProductID: 'sp-1',
          priceCost: 120,
          stock: 10,
        };
      }
      return null;
    }),
    create: jest.fn((_entity: unknown, values: unknown) => ({
      ...(values as object),
      dteDocumentID: 'dte-1',
    })),
    save: jest.fn(async (entity: unknown) => entity),
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
      json: async () => ({ TOKEN: 'token-1', FOLIO: 200, status: 'EMITIDO' }),
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

  it('snapshots COGS from StoreProduct.priceCost and records the ledger on EMITIDO', async () => {
    const service = createService();

    const result = await service.create(undefined, createDteDto() as any);

    expect(result.FOLIO).toBe(200);

    const savedDocument = (manager.save.mock.calls as Array<[any]>).find(
      ([entity]) => entity?.total === 1190 && entity?.dteDocumentID === 'dte-1',
    )?.[0];

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

  it('does not record ledger movements when the DTE is not EMITIDO', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ TOKEN: 'token-1', FOLIO: 200, status: 'ERROR' }),
    });

    const service = createService();
    await service.create(undefined, createDteDto() as any);

    const savedDocument = (manager.save.mock.calls as Array<[any]>).find(
      ([entity]) => entity?.total === 1190 && entity?.dteDocumentID === 'dte-1',
    )?.[0];
    expect(savedDocument.status).toBe('ERROR');
    expect(mockFinancialMovementsService.recordDte).not.toHaveBeenCalled();
  });

  it('reuses an existing DTE by idempotency key without duplicating the ledger', async () => {
    mockDteDocumentRepository.findOne.mockResolvedValue({
      dteDocumentID: 'existing-dte',
      token: 'existing-token',
      folio: 111,
      status: 'EMITIDO',
    });

    const service = createService();
    const result = await service.create('idem-1', createDteDto() as any);

    expect(result.TOKEN).toBe('existing-token');
    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(mockFinancialMovementsService.recordDte).not.toHaveBeenCalled();
    expect(manager.save).not.toHaveBeenCalled();
  });
});
