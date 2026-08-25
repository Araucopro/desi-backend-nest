import { ReturnDteMapperService } from './return-dte-mapper.service';
import { Return, ReturnType } from './entities/return.entity';
import {
  Sale,
  SalePaymentType,
  SaleStatus,
  SaleType,
} from '../sales/entities/sale.entity';
import { Store, StoreType } from '../stores/entities/store.entity';

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
  type: StoreType.FRANCHISE,
} as any;

function sale(overrides: Partial<Sale> = {}): Sale {
  return {
    saleID: 'sale-1',
    tenantID: 'tenant-1',
    storeID: 'store-1',
    saleType: SaleType.BOLETA,
    status: SaleStatus.EMITIDA,
    paymentType: SalePaymentType.CASH,
    folio: 1024,
    issueDate: new Date('2026-08-18'),
    receiver: null,
    total: 2380,
    netTotal: 2000,
    taxTotal: 380,
    cogsTotal: 800,
    dteDocumentID: 'dte-original',
    dteDocument: { folio: 1024, documentType: 39 } as any,
    idempotencyKey: null,
    items: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    store: store as Store,
    ...overrides,
  } as Sale;
}

function ret(overrides: Partial<Return> = {}): Return {
  return {
    returnID: 'ret-1',
    tenantID: 'tenant-1',
    storeID: 'store-1',
    saleID: 'sale-1',
    returnType: ReturnType.PARCIAL,
    status: 'PENDIENTE' as Return['status'],
    reason: 'Devolución parcial',
    discountAmount: 0,
    folio: null,
    dteDocumentID: null,
    dteDocument: null,
    issueDate: new Date('2026-08-25'),
    subtotal: 0,
    netTotal: 1000,
    taxTotal: 190,
    total: 1190,
    cogsTotal: 400,
    userID: null,
    approvedBy: null,
    approvedAt: null,
    completedAt: null,
    idempotencyKey: null,
    items: [
      {
        saleItemID: 'sale-item-1',
        storeProductID: 'sp-1',
        variationID: 'var-1',
        productName: 'Producto A',
        sku: 'SKU-1',
        quantity: 1,
        unitPrice: 1190,
        unitCost: 400,
        lineTotal: 1190,
      } as any,
    ],
    sale: undefined as any,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Return;
}

describe('ReturnDteMapperService', () => {
  const service = new ReturnDteMapperService();

  it('mapea una NCE 61 de boleta con Referencia y montos con IVA incluido', () => {
    const dto = service.mapReturnToNce({
      sale: sale(),
      ret: ret(),
      originalDocumentType: 39,
    });

    expect(dto.dte.Encabezado.IdDoc).toMatchObject({
      TipoDTE: 61,
      IndServicio: '3',
    });
    expect(dto.dte.Encabezado.Emisor).toMatchObject({
      RznSocEmisor: 'Tienda Demo SpA',
      GiroEmisor: 'VENTA AL POR MENOR',
    });
    expect(dto.dte.Encabezado.Emisor).not.toHaveProperty('RznSoc');
    expect(dto.dte.Encabezado.Receptor).toEqual({
      RUTRecep: '66666666-6',
      RznSocRecep: 'Anonimo',
    });
    expect(dto.dte.Detalle[0]).toMatchObject({
      QtyItem: 1,
      PrcItem: 1190,
      MontoItem: 1190,
      CdgItem: { TpoCodigo: 'INT1', VlrCodigo: 'SKU-1' },
    });
    expect(dto.dte.Encabezado.Totales).toMatchObject({
      MntNeto: 1000,
      IVA: 190,
      MntTotal: 1190,
      VlrPagar: 1190,
    });
    expect(dto.dte.Referencia).toMatchObject([
      {
        NroLinRef: 1,
        TpoDocRef: 39,
        FolioRef: 1024,
        FchRef: '2026-08-18',
        CodRef: '6',
      },
    ]);
  });

  it('mapea una NCE 61 de factura con precios netos y receptor original', () => {
    const facturaSale = sale({
      saleType: SaleType.FACTURA,
      folio: 2048,
      dteDocument: { folio: 2048, documentType: 33 } as any,
      receiver: {
        rut: '76123456-7',
        name: 'Cliente SpA',
        giro: 'CONSULTORIA',
      },
    });

    const dto = service.mapReturnToNce({
      sale: facturaSale,
      ret: ret(),
      originalDocumentType: 33,
    });

    expect(dto.dte.Encabezado.IdDoc).toMatchObject({ TipoDTE: 61 });
    expect(dto.dte.Encabezado.Emisor).toMatchObject({
      RznSoc: 'Tienda Demo SpA',
      GiroEmis: 'VENTA AL POR MENOR',
    });
    expect(dto.dte.Encabezado.Emisor).not.toHaveProperty('RznSocEmisor');
    expect(dto.dte.Encabezado.Receptor).toMatchObject({
      RUTRecep: '76123456-7',
      RznSocRecep: 'Cliente SpA',
      GiroRecep: 'CONSULTORIA',
    });
    expect(dto.dte.Detalle[0]).toMatchObject({
      PrcItem: 1000,
      MontoItem: 1000,
    });
    expect(dto.dte.Encabezado.Totales).toMatchObject({
      MntNeto: 1000,
      TasaIVA: '19',
      IVA: 190,
      MntTotal: 1190,
      MontoPeriodo: 1190,
    });
    expect(dto.dte.Referencia).toMatchObject([
      {
        TpoDocRef: 33,
        FolioRef: 2048,
      },
    ]);
  });

  it('mapea DESCUENTO como línea de motivo sin SKU', () => {
    const dto = service.mapReturnToNce({
      sale: sale(),
      ret: ret({
        returnType: ReturnType.DESCUENTO,
        discountAmount: 595,
        reason: 'Descuento posterior',
        items: [],
        total: 595,
      }),
      originalDocumentType: 39,
    });

    expect(dto.dte.Detalle).toHaveLength(1);
    expect(dto.dte.Detalle[0]).toMatchObject({
      NmbItem: 'Descuento posterior',
      MontoItem: 595,
    });
    expect(dto.dte.Detalle[0]).not.toHaveProperty('CdgItem');
    expect(dto.dte.Referencia).toMatchObject([{ CodRef: '4' }]);
  });
});
