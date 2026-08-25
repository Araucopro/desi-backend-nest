import { BadRequestException } from '@nestjs/common';
import {
  assertCanAnular,
  buildPreparedDispatchGuide,
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

  describe('assertCanAnular', () => {
    it('permite anular solo desde EMITIDA', () => {
      expect(() => assertCanAnular(DispatchGuideStatus.EMITIDA)).not.toThrow();
      expect(() => assertCanAnular(DispatchGuideStatus.PENDIENTE)).toThrow(
        BadRequestException,
      );
      expect(() => assertCanAnular(DispatchGuideStatus.ANULADA)).toThrow(
        BadRequestException,
      );
    });
  });
});
