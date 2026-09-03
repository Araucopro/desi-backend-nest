import { DispatchGuideDteMapperService } from './dispatch-guide-dte-mapper.service';

describe('DispatchGuideDteMapperService', () => {
  const service = new DispatchGuideDteMapperService();

  function input(overrides: Record<string, unknown> = {}) {
    return {
      issueDate: new Date('2026-08-25T12:00:00.000Z'),
      indTraslado: '1',
      includePrices: true,
      receiver: {
        rut: '76123456-7',
        name: 'Cliente SpA',
        address: 'Av. Providencia 1234',
        city: 'Providencia',
        giro: 'VENTA AL POR MENOR',
      },
      destination: { address: 'Av. Providencia 1234', city: 'Providencia' },
      transport: null,
      items: [
        {
          storeProductID: 'sp-1',
          variationID: 'var-1',
          productName: 'Producto A',
          sku: 'SKU-1',
          quantity: 2,
          unitPrice: 1190,
          unitCost: 400,
          lineTotal: 2380,
          baseTotal: 2380,
        },
      ],
      total: 2380,
      netTotal: 2000,
      taxTotal: 380,
      store: {
        storeID: 'store-1',
        rut: '76123456-7',
        name: 'Tienda Demo',
        businessName: 'Tienda Demo SpA',
        giro: 'VENTA AL POR MENOR',
        acteco: '479100',
        address: 'Av. Siempre Viva 123',
        city: 'Santiago',
        phone: '+56 2 1234 5678',
        cdgSIISucur: '81303347',
      },
      ...overrides,
    };
  }

  it('construye el payload 52 con IdDoc, emisor, receptor, transporte, totales y detalle', () => {
    const dto = service.mapDispatchGuideToDte(input() as any);

    expect(dto.response).toContain('FOLIO');
    expect(dto.dte.Encabezado.IdDoc).toMatchObject({
      TipoDTE: 52,
      Folio: 0,
      FchEmis: '2026-08-25',
      IndTraslado: '1',
    });
    expect(dto.dte.Encabezado.Emisor).toMatchObject({
      RUTEmisor: '76123456-7',
      RznSoc: 'Tienda Demo SpA',
      Acteco: ['479100'],
      CdgSIISucur: '81303347',
    });
    expect(dto.dte.Encabezado.Receptor).toMatchObject({
      RUTRecep: '76123456-7',
      RznSocRecep: 'Cliente SpA',
      DirRecep: 'Av. Providencia 1234',
      CmnaRecep: 'Providencia',
    });
    expect((dto.dte.Encabezado as any).Transporte).toEqual({
      DirDest: 'Av. Providencia 1234',
      CmnaDest: 'Providencia',
    });
    expect(dto.dte.Encabezado.Totales).toEqual({
      MntNeto: 2000,
      TasaIVA: '19',
      IVA: 380,
      MntTotal: 2380,
      VlrPagar: 2380,
    });
    expect(dto.dte.Detalle[0]).toMatchObject({
      NroLinDet: 1,
      NmbItem: 'Producto A',
      QtyItem: 2,
      PrcItem: 1000,
      MontoItem: 2000,
      CdgItem: { TpoCodigo: 'INT1', VlrCodigo: 'SKU-1' },
    });
    expect((dto.dte as any).Transporte).toBeUndefined();
  });

  it('emite sin precios con IndTraslado configurable y totales/detalle en cero', () => {
    const dto = service.mapDispatchGuideToDte(
      input({ indTraslado: '5', includePrices: false }) as any,
    );

    expect(dto.dte.Encabezado.IdDoc).toMatchObject({
      TipoDTE: 52,
      IndTraslado: '5',
    });
    expect(dto.dte.Encabezado.Totales).toEqual({
      MntNeto: 0,
      IVA: 0,
      MntTotal: 0,
      VlrPagar: 0,
    });
    expect(dto.dte.Encabezado.Totales).not.toHaveProperty('TasaIVA');
    expect(dto.dte.Detalle[0]).toMatchObject({
      PrcItem: 0,
      MontoItem: 0,
    });
  });

  it('agrega datos de transporte en Encabezado.Transporte cuando el creador los entregó', () => {
    const dto = service.mapDispatchGuideToDte(
      input({
        transport: {
          patente: 'AAAA11',
          rutConductor: '76123456-7',
          nombreConductor: 'Juan Pérez',
          fechaTraslado: '2026-08-25',
        },
      }) as any,
    );

    expect((dto.dte.Encabezado as any).Transporte).toEqual({
      Patente: 'AAAA11',
      RUTTrans: '76123456-7',
      NombreTrans: 'Juan Pérez',
      DirDest: 'Av. Providencia 1234',
      CmnaDest: 'Providencia',
      FechaTraslado: '2026-08-25',
    });
  });
});
