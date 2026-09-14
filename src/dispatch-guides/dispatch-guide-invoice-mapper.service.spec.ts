import { DispatchGuideInvoiceMapperService } from './dispatch-guide-invoice-mapper.service';
import { DteDocumentPaymentType } from '../dte/entities/dte-document.entity';
import { DispatchGuideStatus } from './entities/dispatch-guide.entity';

describe('DispatchGuideInvoiceMapperService', () => {
  const service = new DispatchGuideInvoiceMapperService();

  const store: any = {
    storeID: 'store-1',
    rut: '76123456-7',
    name: 'Tienda Central',
    businessName: 'Comercial Arauco SpA',
    giro: 'VENTA AL POR MENOR',
    acteco: '479100',
    address: 'Av. Providencia 1234',
    city: 'Providencia',
    phone: '+56 2 2345 6789',
    cdgSIISucur: '81303347',
  };

  function mockGuide(overrides: Record<string, any> = {}): any {
    return {
      dispatchGuideID: 'guide-1',
      status: DispatchGuideStatus.EMITIDA,
      folio: 1001,
      issueDate: new Date('2026-08-20T12:00:00.000Z'),
      receiver: {
        rut: '76999888-5',
        name: 'Cliente Mayorista SpA',
        giro: 'CONSTRUCCION',
        address: 'Calle Los Alerces 500',
        city: 'Santiago',
        email: 'contacto@mayorista.cl',
      },
      items: [
        {
          storeProductID: 'sp-1',
          variationID: 'var-1',
          productName: 'Cemento Bío Bío 25kg',
          sku: 'CEM-BIO-25',
          quantity: 10,
          unitPrice: 5950, // Con IVA (neto 5000)
          unitCost: 3500,
          lineTotal: 59500,
        },
      ],
      total: 59500,
      netTotal: 50000,
      taxTotal: 9500,
      cogsTotal: 35000,
      ...overrides,
    };
  }

  it('transforma 1 guía a factura electrónica 33 con referencia DTE 52', () => {
    const guide = mockGuide();
    const result = service.mapGuidesToInvoice([guide], store, {
      paymentType: DteDocumentPaymentType.CASH,
      issueDate: '2026-08-25',
    });

    expect(result.dteDto.dte.Encabezado.IdDoc).toMatchObject({
      TipoDTE: 33,
      Folio: 0,
      FchEmis: '2026-08-25',
      FmaPago: '1',
    });

    expect(result.dteDto.dte.Encabezado.Receptor).toMatchObject({
      RUTRecep: '76999888-5',
      RznSocRecep: 'Cliente Mayorista SpA',
      GiroRecep: 'CONSTRUCCION',
    });

    expect(result.dteDto.dte.Encabezado.Totales).toEqual({
      MntNeto: 50000,
      TasaIVA: '19',
      IVA: 9500,
      MntTotal: 59500,
      MontoPeriodo: 59500,
      VlrPagar: 59500,
    });

    expect(result.dteDto.dte.Referencia).toEqual([
      {
        NroLinRef: 1,
        TpoDocRef: 52,
        FolioRef: 1001,
        FchRef: '2026-08-20',
        RazonRef: 'Guía de despacho',
      },
    ]);

    expect(result.dteDto.dte.Detalle).toHaveLength(1);
    expect(result.dteDto.dte.Detalle[0]).toMatchObject({
      NroLinDet: 1,
      NmbItem: 'Cemento Bío Bío 25kg',
      QtyItem: 10,
      PrcItem: 5000,
      MontoItem: 50000,
      CdgItem: { TpoCodigo: 'INT1', VlrCodigo: 'CEM-BIO-25' },
    });
  });

  it('consolida múltiples guías (N guías a 1 factura) sumando cantidades y acumulando referencias', () => {
    const guide1 = mockGuide({
      dispatchGuideID: 'guide-1',
      folio: 1001,
      issueDate: new Date('2026-08-10T12:00:00.000Z'),
    });
    const guide2 = mockGuide({
      dispatchGuideID: 'guide-2',
      folio: 1002,
      issueDate: new Date('2026-08-15T12:00:00.000Z'),
      items: [
        {
          storeProductID: 'sp-1',
          variationID: 'var-1',
          productName: 'Cemento Bío Bío 25kg',
          sku: 'CEM-BIO-25',
          quantity: 5,
          unitPrice: 5950,
          unitCost: 3500,
          lineTotal: 29750,
        },
      ],
    });

    const result = service.mapGuidesToInvoice([guide1, guide2], store, {
      paymentType: DteDocumentPaymentType.CREDIT,
    });

    expect(result.dteDto.dte.Referencia).toHaveLength(2);
    expect(result.dteDto.dte.Referencia).toEqual([
      {
        NroLinRef: 1,
        TpoDocRef: 52,
        FolioRef: 1001,
        FchRef: '2026-08-10',
        RazonRef: 'Guía de despacho',
      },
      {
        NroLinRef: 2,
        TpoDocRef: 52,
        FolioRef: 1002,
        FchRef: '2026-08-15',
        RazonRef: 'Guía de despacho',
      },
    ]);

    // Ítem consolidado: 10 + 5 = 15 unidades
    expect(result.consolidatedItems).toHaveLength(1);
    expect(result.consolidatedItems[0].quantity).toBe(15);
    expect(result.total).toBe(89250);
    expect(result.netTotal).toBe(75000);
    expect(result.taxTotal).toBe(14250);
  });

  it('rechaza consolidar si los receptores tienen distinto RUT', () => {
    const guide1 = mockGuide({ dispatchGuideID: 'guide-1' });
    const guide2 = mockGuide({
      dispatchGuideID: 'guide-2',
      receiver: { rut: '55555555-5', name: 'Otro Cliente' },
    });

    expect(() =>
      service.mapGuidesToInvoice([guide1, guide2], store, {
        paymentType: DteDocumentPaymentType.CASH,
      }),
    ).toThrow(
      'Todas las guías a consolidar deben pertenecer al mismo receptor',
    );
  });

  it('rechaza si alguna guía no tiene folio', () => {
    const guide = mockGuide({ folio: null });

    expect(() =>
      service.mapGuidesToInvoice([guide], store, {
        paymentType: DteDocumentPaymentType.CASH,
      }),
    ).toThrow('no tiene folio SII asignado');
  });

  it('rechaza si se superan las 40 guías (límite máximo legal de referencias SII)', () => {
    const guides = Array.from({ length: 41 }, (_, i) =>
      mockGuide({ dispatchGuideID: `guide-${i}`, folio: 2000 + i }),
    );

    expect(() =>
      service.mapGuidesToInvoice(guides, store, {
        paymentType: DteDocumentPaymentType.CASH,
      }),
    ).toThrow(
      'El SII permite un máximo de 40 documentos referenciados por factura',
    );
  });
});
