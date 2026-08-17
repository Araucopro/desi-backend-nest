import { BadRequestException } from '@nestjs/common';
import { DteMapperService } from './dte-mapper.service';
import { SalePaymentType, SaleType } from './entities/sale.entity';
import { StoreType } from '../stores/entities/store.entity';

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
  type: StoreType.FRANCHISE,
  location: 'Santiago',
} as any;

function saleInput(overrides: Record<string, unknown> = {}) {
  return {
    saleType: SaleType.NOTA_VENTA,
    paymentType: SalePaymentType.CASH,
    issueDate: new Date('2026-08-06T12:00:00.000Z'),
    receiver: { rut: '66666666-6', name: 'Cliente Ejemplo' },
    items: [
      {
        productName: 'Producto A',
        sku: 'SKU-1',
        quantity: 2,
        unitPrice: 1000,
        lineTotal: 2000,
      },
    ],
    total: 2000,
    netTotal: 1680.67,
    taxTotal: 319.33,
    store,
    ...overrides,
  };
}

describe('DteMapperService', () => {
  const service = new DteMapperService();

  it('maps a boleta with generic receptor and IVA-included item prices', () => {
    const dto = service.mapSaleToDte(saleInput(), { documentType: 39 });
    const encabezado = dto.dte.Encabezado;

    expect(encabezado.IdDoc.TipoDTE).toBe(39);
    expect(encabezado.IdDoc).not.toHaveProperty('FmaPago');
    expect(encabezado.IdDoc).toMatchObject({ IndServicio: '3' });
    expect(encabezado.Emisor).toMatchObject({
      RznSocEmisor: 'Tienda Demo SpA',
      GiroEmisor: 'VENTA AL POR MENOR',
    });
    expect(encabezado.Emisor).not.toHaveProperty('RznSoc');
    expect(encabezado.Emisor).not.toHaveProperty('GiroEmis');
    expect(encabezado.Emisor).not.toHaveProperty('Acteco');
    expect(encabezado.Emisor).not.toHaveProperty('Telefono');
    expect(encabezado.Receptor).toEqual({
      RUTRecep: '66666666-6',
      RznSocRecep: 'Anonimo',
    });
    expect(dto.dte.Detalle[0]).toMatchObject({
      QtyItem: 2,
      PrcItem: 1000,
      MontoItem: 2000,
    });
    expect(encabezado.Totales).toMatchObject({
      MntNeto: 1681,
      IVA: 319,
      MntTotal: 2000,
      VlrPagar: 2000,
    });
    expect(encabezado.Totales).not.toHaveProperty('TasaIVA');
    expect(encabezado.Totales).not.toHaveProperty('MontoPeriodo');
    expect(Number.isInteger(encabezado.Totales!.MntNeto)).toBe(true);
    expect(Number.isInteger(encabezado.Totales!.IVA)).toBe(true);
    expect(Number.isInteger(encabezado.Totales!.MntTotal)).toBe(true);
    expect(Number.isInteger(dto.dte.Detalle[0].MontoItem)).toBe(true);
    expect(Number.isInteger(dto.dte.Detalle[0].PrcItem)).toBe(true);
  });

  it('maps a factura with validated receptor and net prices', () => {
    const dto = service.mapSaleToDte(saleInput(), { documentType: 33 });
    const encabezado = dto.dte.Encabezado;

    expect(encabezado.IdDoc.TipoDTE).toBe(33);
    expect(encabezado.IdDoc).toMatchObject({ FmaPago: '1' });
    expect(encabezado.Emisor).toMatchObject({
      RznSoc: 'Tienda Demo SpA',
      GiroEmis: 'VENTA AL POR MENOR',
    });
    expect(encabezado.Emisor).not.toHaveProperty('RznSocEmisor');
    expect(encabezado.Emisor).not.toHaveProperty('GiroEmisor');
    expect(encabezado.Emisor).toMatchObject({
      Acteco: ['479100'],
      Telefono: '+56 2 1234 5678',
    });
    expect(encabezado.Receptor).toMatchObject({
      RUTRecep: '66666666-6',
      RznSocRecep: 'Cliente Ejemplo',
    });
    expect(dto.dte.Detalle[0]).toMatchObject({
      PrcItem: 840,
      MontoItem: 1681,
    });
    expect(encabezado.Totales).toMatchObject({
      MntNeto: 1681,
      TasaIVA: '19',
      IVA: 319,
      MntTotal: 2000,
      MontoPeriodo: 2000,
      VlrPagar: 2000,
    });
    expect(Number.isInteger(encabezado.Totales!.MntNeto)).toBe(true);
    expect(Number.isInteger(encabezado.Totales!.IVA)).toBe(true);
    expect(Number.isInteger(dto.dte.Detalle[0].MontoItem)).toBe(true);
    expect(Number.isInteger(dto.dte.Detalle[0].PrcItem)).toBe(true);
  });

  it('rejects a factura without receiver', () => {
    expect(() =>
      service.mapSaleToDte(saleInput({ receiver: null }), { documentType: 33 }),
    ).toThrow(BadRequestException);
  });
});
