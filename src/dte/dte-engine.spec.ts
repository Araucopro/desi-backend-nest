import { Store } from '../stores/entities/store.entity';
import { DteDocument, DteDocumentStatus } from './entities/dte-document.entity';
import {
  LOCAL_TOKEN_PREFIX,
  buildDteFinalizePlan,
  buildDtePreparationValues,
  buildLocalToken,
  costSnapshotChanged,
  readNormalizedItems,
  resolveFolio,
  toDateOnly,
} from './dte-engine';

function documentWithItems(items: unknown, cogsTotal = 800): DteDocument {
  return {
    dteDocumentID: 'dte-1',
    token: 'local-existing',
    folio: 100,
    status: DteDocumentStatus.PENDIENTE,
    cogsTotal,
    payloadNormalized: { items },
  } as unknown as DteDocument;
}

describe('dte-engine', () => {
  it('converts ISO dates to noon dates and falls back for invalid values', () => {
    expect(toDateOnly('2026-08-06').toISOString()).toBe(
      new Date('2026-08-06T12:00:00').toISOString(),
    );
    expect(toDateOnly('invalid')).toBeInstanceOf(Date);
  });

  it('builds a local token with the expected prefix and entropy', () => {
    const token = buildLocalToken();
    expect(token).toMatch(new RegExp(`^${LOCAL_TOKEN_PREFIX}[0-9a-f]{56}$`));
    expect(buildLocalToken()).not.toBe(token);
  });

  it('keeps positive folios and generates a random folio otherwise', () => {
    expect(resolveFolio(123)).toBe(123);
    for (let index = 0; index < 20; index++) {
      const folio = resolveFolio();
      expect(folio).toBeGreaterThanOrEqual(100000);
      expect(folio).toBeLessThan(999999);
      expect(Number.isInteger(folio)).toBe(true);
    }
  });

  it('reads normalized items only when they are an array', () => {
    expect(
      readNormalizedItems(
        documentWithItems([{ NroLinDet: 1, costPrice: 400, costTotal: 800 }]),
      ),
    ).toEqual([{ NroLinDet: 1, costPrice: 400, costTotal: 800 }]);
    expect(readNormalizedItems(documentWithItems(null))).toEqual([]);
  });

  it('detects COGS snapshot changes', () => {
    const current = [{ NroLinDet: 1, costPrice: 400, costTotal: 800 }];
    const document = documentWithItems(current);

    expect(costSnapshotChanged(document, current as any, 800)).toBe(false);
    expect(costSnapshotChanged(document, current as any, 801)).toBe(true);
    expect(
      costSnapshotChanged(documentWithItems(null), current as any, 800),
    ).toBe(true);
    expect(
      costSnapshotChanged(
        document,
        [{ NroLinDet: 1, costPrice: 400, costTotal: 900 }] as any,
        800,
      ),
    ).toBe(true);
  });

  it('builds DTE preparation values from the payload and totals', () => {
    const dto = {
      purchaseOrderID: 'po-1',
      response: ['FOLIO'],
      dte: {
        Encabezado: {
          IdDoc: { TipoDTE: 33, FchEmis: '2026-08-06' },
        },
      },
    } as any;
    const store = {
      storeID: 'store-1',
      rut: '76123456-7',
      name: 'Tienda Central',
      location: 'Santiago',
    } as Store;
    const normalizedItems = [
      {
        NroLinDet: 1,
        NmbItem: 'Producto A',
        QtyItem: 2,
        PrcItem: 500,
        MontoItem: 1000,
        costPrice: 400,
        costTotal: 800,
        variationID: 'var-1',
      },
    ];

    const values = buildDtePreparationValues({
      dto,
      store,
      normalizedItems: normalizedItems as any,
      totals: {
        subtotal: 1000,
        net: 1000,
        tax: 190,
        total: 1190,
        cogsTotal: 800,
      },
      tenantID: 'tenant-1',
      apikey: 'apikey-masked',
      idempotencyKey: 'idem-1',
      purchaseOrderID: 'po-1',
      saleID: undefined,
      reserveStock: true,
      token: 'token-local',
      folio: 123,
      paymentType: 'Efectivo' as any,
    });

    expect(values).toMatchObject({
      tenantID: 'tenant-1',
      apikey: 'apikey-masked',
      idempotencyKey: 'idem-1',
      purchaseOrderID: 'po-1',
      saleID: null,
      stockReserved: true,
      token: 'token-local',
      folio: 123,
      storeID: 'store-1',
      status: DteDocumentStatus.PENDIENTE,
      documentType: 33,
      total: 1190,
      netTotal: 1000,
      taxTotal: 190,
      cogsTotal: 800,
      errorDetail: null,
    });
    expect(values.issueDate.toISOString()).toBe(
      new Date('2026-08-06T12:00:00').toISOString(),
    );
    expect(values.payloadNormalized).toMatchObject({
      token: 'token-local',
      folio: 123,
      status: DteDocumentStatus.PENDIENTE,
      items: normalizedItems,
    });
  });

  it('builds a success finalize plan from Openfactura response', () => {
    const result = {
      ok: true,
      payload: {
        TOKEN: 'token-1',
        FOLIO: 200,
        status: 'EMITIDO',
      },
    } as any;

    const plan = buildDteFinalizePlan(documentWithItems([]), result);

    expect(plan).toEqual({
      kind: 'success',
      status: DteDocumentStatus.EMITIDO,
      token: 'token-1',
      folio: 200,
      errorDetail: null,
      extraPayload: result.payload,
    });
  });

  it('falls back to lowercase Openfactura fields and pending status', () => {
    const plan = buildDteFinalizePlan(documentWithItems([]), {
      ok: true,
      payload: { token: 'lower-token', folio: 301, status: 'PENDIENTE' },
    });

    expect(plan).toMatchObject({
      kind: 'success',
      status: DteDocumentStatus.PENDIENTE,
      token: 'lower-token',
      folio: 301,
    });
  });

  it('builds an error plan when Openfactura reports ERROR', () => {
    const document = documentWithItems([]);
    const plan = buildDteFinalizePlan(document, {
      ok: true,
      payload: { status: 'ERROR', detail: 'rechazado' },
    });

    expect(plan).toMatchObject({
      kind: 'error',
      status: DteDocumentStatus.ERROR,
      token: document.token,
      folio: document.folio,
      errorDetail: expect.stringContaining('Openfactura reportó estado ERROR'),
      message: expect.stringContaining(document.dteDocumentID),
    });
  });

  it('builds an error plan for failed Openfactura calls', () => {
    const plan = buildDteFinalizePlan(documentWithItems([]), {
      ok: false,
      errorDetail: 'Openfactura respondió con estado 500',
      token: 'remote-token',
      folio: 99,
    });

    expect(plan).toEqual({
      kind: 'error',
      status: DteDocumentStatus.ERROR,
      token: 'remote-token',
      folio: 99,
      errorDetail: 'Openfactura respondió con estado 500',
      message: expect.stringContaining(
        'Openfactura no pudo emitir el documento',
      ),
    });
  });
});
