import { BadRequestException } from '@nestjs/common';
import {
  assertCanAnular,
  assertCanConfirmAnulacion,
  buildPreparedDispatchGuide,
  buildPreparedDispatchGuideWithoutPrices,
  computeGuideTotalsFromItems,
  computeLineNetAmounts,
  getRemainingQuantities,
  planConsumption,
  validateDispatchGuideCoverage,
  validateDispatchGuideRequest,
} from './dispatch-guides-engine';
import { DispatchGuideStatus } from './entities/dispatch-guide.entity';

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

function pricing() {
  return {
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
  };
}

describe('DispatchGuidesEngine', () => {
  describe('validateDispatchGuideRequest', () => {
    it('acepta un request válido con receptor y destino', () => {
      expect(() =>
        validateDispatchGuideRequest(validDto() as any),
      ).not.toThrow();
    });

    it('rechaza receptor sin RUT o nombre', () => {
      const dto = validDto();
      dto.receiver = { rut: '', name: 'Cliente' } as any;
      expect(() => validateDispatchGuideRequest(dto as any)).toThrow(
        BadRequestException,
      );
    });

    it('rechaza destino sin dirección o comuna', () => {
      const dto = validDto();
      dto.destination = { address: '', city: 'Providencia' } as any;
      expect(() => validateDispatchGuideRequest(dto as any)).toThrow(
        BadRequestException,
      );
    });

    it('rechaza una guía sin ítems', () => {
      const dto = validDto();
      dto.items = [];
      expect(() => validateDispatchGuideRequest(dto as any)).toThrow(
        BadRequestException,
      );
    });
  });

  describe('buildPreparedDispatchGuide', () => {
    it('calcula montos netos con IVA 19% y congela costo', () => {
      const prepared = buildPreparedDispatchGuide(
        validDto() as any,
        pricing() as any,
      );

      expect(prepared.status).toBe(DispatchGuideStatus.PENDIENTE);
      expect(prepared.indTraslado).toBe('1');
      expect(prepared.includePrices).toBe(true);
      expect(prepared.subtotal).toBe(2380);
      expect(prepared.discount).toBe(0);
      expect(prepared.total).toBe(2380);
      expect(prepared.netTotal).toBe(2000);
      expect(prepared.taxTotal).toBe(380);
      expect(prepared.cogsTotal).toBe(800);
      expect(prepared.items[0]).toMatchObject({
        storeProductID: 'sp-1',
        variationID: 'var-1',
        sku: 'SKU-1',
        quantity: 2,
        unitPrice: 1190,
        unitCost: 400,
        lineTotal: 2380,
      });
      expect(prepared.receiver).toMatchObject({ rut: '76123456-7' });
      expect(prepared.destination).toEqual({
        address: 'Av. Providencia 1234',
        city: 'Providencia',
      });
    });

    it('cuadra los totales de abajo hacia arriba cuando el neto unitario no es entero (OF-10)', () => {
      const dto = validDto() as any;
      dto.items = [{ storeProductID: 'sp-1', quantity: 10 }];
      const prepared = buildPreparedDispatchGuide(dto, {
        items: [
          {
            storeProductID: 'sp-1',
            variationID: 'var-1',
            productID: 'product-1',
            productName: 'Demoo',
            sku: '1001',
            quantity: 10,
            baseUnitPrice: 1500,
            unitCost: 500,
            basePrice: 15000,
            finalUnitPrice: 1500,
            lineTotal: 15000,
            discountsApplied: [],
            breakdown: [],
          },
        ],
        totals: { subtotal: 15000, discount: 0, total: 15000 },
        pricingContext: { storeID: 'store-1' },
      } as any);

      // El bruto comercial se conserva en subtotal/discount.
      expect(prepared.subtotal).toBe(15000);
      expect(prepared.discount).toBe(0);
      expect(prepared.items[0]).toMatchObject({
        quantity: 10,
        unitPrice: 1500,
        lineTotal: 15000,
      });

      // Los totales netos nacen del detalle: 1261 × 10 = 12610.
      expect(prepared.netTotal).toBe(12610);
      expect(prepared.taxTotal).toBe(2396);
      expect(prepared.total).toBe(15006);
    });

    it('conserva el transporte solo cuando viene', () => {
      const dto = validDto() as any;
      dto.transport = { patente: 'AAAA11', nombreConductor: 'Juan Pérez' };
      const prepared = buildPreparedDispatchGuide(dto, pricing() as any);
      expect(prepared.transport).toEqual({
        patente: 'AAAA11',
        nombreConductor: 'Juan Pérez',
      });

      const withoutTransport = buildPreparedDispatchGuide(
        validDto() as any,
        pricing() as any,
      );
      expect(withoutTransport.transport).toBeNull();
    });

    it('respeta indTraslado e includePrices del DTO', () => {
      const dto = validDto() as any;
      dto.indTraslado = '3';
      dto.includePrices = false;
      const prepared = buildPreparedDispatchGuide(dto, pricing() as any);
      expect(prepared.indTraslado).toBe('3');
      expect(prepared.includePrices).toBe(false);
    });
  });

  describe('computeLineNetAmounts y computeGuideTotalsFromItems', () => {
    it('deriva MontoItem de PrcItem × QtyItem para evitar descuadres', () => {
      const incidente = computeLineNetAmounts(10, 15000);
      expect(incidente).toEqual({ prcItem: 1261, montoItem: 12610 });
      expect(incidente.montoItem).toBe(incidente.prcItem * 10);

      expect(computeLineNetAmounts(2, 2380)).toEqual({
        prcItem: 1000,
        montoItem: 2000,
      });
    });

    it('devuelve ceros cuando no hay cantidad válida', () => {
      expect(computeLineNetAmounts(0, 15000)).toEqual({
        prcItem: 0,
        montoItem: 0,
      });
    });

    it('suma neto, IVA y total desde el detalle', () => {
      expect(
        computeGuideTotalsFromItems([
          { quantity: 10, lineTotal: 15000 },
          { quantity: 2, lineTotal: 2380 },
        ]),
      ).toEqual({ netTotal: 14610, taxTotal: 2776, total: 17386 });
    });

    it('mantiene totales en cero sin precios', () => {
      expect(
        computeGuideTotalsFromItems([{ quantity: 2, lineTotal: 0 }]),
      ).toEqual({ netTotal: 0, taxTotal: 0, total: 0 });
    });
  });

  describe('buildPreparedDispatchGuideWithoutPrices', () => {
    it('construye ítems y montos en cero sin PricingService', () => {
      const dto = validDto() as any;
      dto.indTraslado = '5';
      dto.includePrices = false;
      const prepared = buildPreparedDispatchGuideWithoutPrices(dto, [
        {
          storeProductID: 'sp-1',
          variationID: 'var-1',
          productName: 'Producto A',
          sku: 'SKU-1',
          quantity: 2,
        },
      ]);

      expect(prepared.indTraslado).toBe('5');
      expect(prepared.includePrices).toBe(false);
      expect(prepared.items[0]).toMatchObject({
        unitPrice: 0,
        unitCost: 0,
        lineTotal: 0,
        baseTotal: 0,
      });
      expect(prepared.subtotal).toBe(0);
      expect(prepared.total).toBe(0);
      expect(prepared.netTotal).toBe(0);
      expect(prepared.taxTotal).toBe(0);
      expect(prepared.cogsTotal).toBe(0);
    });

    it('rechaza descuento manual en guías sin precios', () => {
      const dto = validDto() as any;
      dto.includePrices = false;
      dto.manualDiscount = 10;
      expect(() => buildPreparedDispatchGuideWithoutPrices(dto, [])).toThrow(
        BadRequestException,
      );
    });
  });

  describe('validateDispatchGuideCoverage', () => {
    it('acepta cobertura por variación sin consumir cantidades', () => {
      const guides = [
        { items: [{ variationID: 'var-1', quantity: 2 }] },
        { items: [{ variationID: 'var-1', quantity: 1 }] },
      ];
      expect(() =>
        validateDispatchGuideCoverage(guides, [
          { variationID: 'var-1', quantity: 3 },
        ]),
      ).not.toThrow();
    });

    it('rechaza cuando la venta supera la suma despachada', () => {
      const guides = [{ items: [{ variationID: 'var-1', quantity: 2 }] }];
      expect(() =>
        validateDispatchGuideCoverage(guides, [
          { variationID: 'var-1', quantity: 3 },
        ]),
      ).toThrow(BadRequestException);
    });

    it('rechaza variaciones sin cobertura', () => {
      const guides = [{ items: [{ variationID: 'var-1', quantity: 2 }] }];
      expect(() =>
        validateDispatchGuideCoverage(guides, [
          { variationID: 'var-2', quantity: 1 },
        ]),
      ).toThrow(BadRequestException);
    });
  });

  describe('consumo acumulado de guías', () => {
    const guides = [
      {
        dispatchGuideID: 'dg-1',
        items: [{ variationID: 'var-1', quantity: 3 }],
      },
      {
        dispatchGuideID: 'dg-2',
        items: [{ variationID: 'var-1', quantity: 2 }],
      },
    ];

    it('calcula el saldo restante restando el consumo previo', () => {
      const remaining = getRemainingQuantities(guides, [
        { dispatchGuideID: 'dg-1', variationID: 'var-1', quantity: 1 },
        { dispatchGuideID: 'dg-2', variationID: 'var-1', quantity: 2 },
      ]);
      expect(remaining.get('dg-1')?.get('var-1')).toBe(2);
      expect(remaining.get('dg-2')?.get('var-1')).toBe(0);
    });

    it('reparte el consumo entre N guías en orden determinístico', () => {
      const plan = planConsumption(
        guides,
        [],
        [{ variationID: 'var-1', quantity: 4 }],
      );
      expect(plan).toEqual([
        { dispatchGuideID: 'dg-1', variationID: 'var-1', quantity: 3 },
        { dispatchGuideID: 'dg-2', variationID: 'var-1', quantity: 1 },
      ]);
    });

    it('rechaza cuando el consumo acumulado excede la cobertura', () => {
      expect(() =>
        planConsumption(
          guides,
          [{ dispatchGuideID: 'dg-1', variationID: 'var-1', quantity: 2 }],
          [{ variationID: 'var-1', quantity: 4 }],
        ),
      ).toThrow(BadRequestException);
    });
  });

  describe('assertCanAnular', () => {
    it('permite anular solo desde EMITIDA', () => {
      expect(() => assertCanAnular(DispatchGuideStatus.EMITIDA)).not.toThrow();
      expect(() => assertCanAnular(DispatchGuideStatus.PENDIENTE)).toThrow(
        BadRequestException,
      );
      expect(() => assertCanAnular(DispatchGuideStatus.ANULADA)).toThrow(
        BadRequestException,
      );
      expect(() =>
        assertCanAnular(DispatchGuideStatus.ANULACION_PENDIENTE),
      ).toThrow(BadRequestException);
    });

    it('permite confirmar anulación solo desde ANULACION_PENDIENTE', () => {
      expect(() =>
        assertCanConfirmAnulacion(DispatchGuideStatus.ANULACION_PENDIENTE),
      ).not.toThrow();
      expect(() =>
        assertCanConfirmAnulacion(DispatchGuideStatus.EMITIDA),
      ).toThrow(BadRequestException);
    });
  });
});
