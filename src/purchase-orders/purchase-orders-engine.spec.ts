import { BadRequestException } from '@nestjs/common';
import { PurchaseOrderItem } from './entities/purchase-order-item.entity';
import { PurchaseOrderCommercialStatus } from './entities/purchase-order.entity';
import {
  buildVerificationPlan,
  calculateTotals,
  ensureCommercialStatusTransition,
  toMoney,
} from './purchase-orders-engine';

function item(
  variationID: string,
  quantityRequested: number,
  quantityReceived: number,
  unitPrice: number,
): PurchaseOrderItem {
  return {
    variation: { variationID } as PurchaseOrderItem['variation'],
    quantityRequested,
    quantityReceived,
    unitPrice,
    subtotal: toMoney(unitPrice * quantityRequested),
  } as PurchaseOrderItem;
}

describe('PurchaseOrdersEngine', () => {
  describe('calculateTotals', () => {
    it('calculates subtotal, net, IVA and total', () => {
      const items = [{ subtotal: 1000 }, { subtotal: 500 }];

      expect(calculateTotals(items, 0)).toEqual({
        subtotal: 1500,
        net: 1500,
        tax: 285,
        total: 1785,
      });
    });

    it('applies the discount before IVA', () => {
      const items = [{ subtotal: 1000 }, { subtotal: 500 }];

      expect(calculateTotals(items, 300)).toEqual({
        subtotal: 1500,
        net: 1200,
        tax: 228,
        total: 1428,
      });
    });

    it('keeps totals at zero for empty items', () => {
      expect(calculateTotals([], 0)).toEqual({
        subtotal: 0,
        net: 0,
        tax: 0,
        total: 0,
      });
    });
  });

  describe('ensureCommercialStatusTransition', () => {
    it('allows valid transitions', () => {
      expect(() =>
        ensureCommercialStatusTransition(
          PurchaseOrderCommercialStatus.PENDIENTE,
          PurchaseOrderCommercialStatus.ENVIADO,
        ),
      ).not.toThrow();
      expect(() =>
        ensureCommercialStatusTransition(
          PurchaseOrderCommercialStatus.PENDIENTE,
          PurchaseOrderCommercialStatus.RECHAZADO,
        ),
      ).not.toThrow();
      expect(() =>
        ensureCommercialStatusTransition(
          PurchaseOrderCommercialStatus.ENVIADO,
          PurchaseOrderCommercialStatus.ACEPTADO,
        ),
      ).not.toThrow();
      expect(() =>
        ensureCommercialStatusTransition(
          PurchaseOrderCommercialStatus.ENVIADO,
          PurchaseOrderCommercialStatus.RECHAZADO,
        ),
      ).not.toThrow();
    });

    it('allows keeping the same status', () => {
      expect(() =>
        ensureCommercialStatusTransition(
          PurchaseOrderCommercialStatus.PENDIENTE,
          PurchaseOrderCommercialStatus.PENDIENTE,
        ),
      ).not.toThrow();
    });

    it('rejects invalid or backwards transitions', () => {
      expect(() =>
        ensureCommercialStatusTransition(
          PurchaseOrderCommercialStatus.PENDIENTE,
          PurchaseOrderCommercialStatus.ACEPTADO,
        ),
      ).toThrow(BadRequestException);
      expect(() =>
        ensureCommercialStatusTransition(
          PurchaseOrderCommercialStatus.ACEPTADO,
          PurchaseOrderCommercialStatus.PENDIENTE,
        ),
      ).toThrow(BadRequestException);
      expect(() =>
        ensureCommercialStatusTransition(
          PurchaseOrderCommercialStatus.ENVIADO,
          PurchaseOrderCommercialStatus.PENDIENTE,
        ),
      ).toThrow(BadRequestException);
    });
  });

  describe('buildVerificationPlan', () => {
    it('builds the summary, adjusts over-received items and plans new items', () => {
      const plan = buildVerificationPlan({
        purchaseOrderID: 'po-1',
        items: [
          item('v1', 10, 0, 100),
          item('v2', 5, 0, 50),
          item('v3', 3, 0, 30),
          item('v5', 3, 0, 20),
        ],
        scans: [
          { variationID: 'v1', quantityReceived: 10 },
          { variationID: 'v2', quantityReceived: 4 },
          { variationID: 'v3', quantityReceived: 5 },
          { variationID: 'v4', quantityReceived: 2, unitPrice: 25 },
        ],
        discount: 0,
      });

      expect(plan.summary).toEqual({
        completos: 1,
        faltantes: 4,
        deMas: 2,
        noEsperados: 2,
      });

      const v3 = plan.items.find(
        (planned) =>
          planned.kind === 'existing' &&
          planned.item.variation.variationID === 'v3',
      );
      expect(v3).toBeDefined();
      if (v3?.kind === 'existing') {
        expect(v3.item.quantityRequested).toBe(5);
        expect(v3.item.quantityReceived).toBe(5);
        expect(v3.item.subtotal).toBe(150);
      }

      const v4 = plan.items.find(
        (planned) =>
          planned.kind === 'new' &&
          planned.values.variationID === 'v4',
      );
      expect(v4).toMatchObject({
        kind: 'new',
        values: {
          purchaseOrderID: 'po-1',
          variationID: 'v4',
          unitPrice: 25,
          quantityRequested: 2,
          quantityReceived: 2,
          subtotal: 50,
        },
      });

      expect(plan.totals).toEqual({
        subtotal: 1510,
        net: 1510,
        tax: 286.9,
        total: 1796.9,
      });
    });

    it('rejects reducing a quantity already received', () => {
      expect(() =>
        buildVerificationPlan({
          purchaseOrderID: 'po-1',
          items: [item('v1', 10, 5, 100)],
          scans: [{ variationID: 'v1', quantityReceived: 3 }],
          discount: 0,
        }),
      ).toThrow(BadRequestException);
    });
  });
});
