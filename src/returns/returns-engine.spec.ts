import { BadRequestException } from '@nestjs/common';
import {
  Sale,
  SalePaymentType,
  SaleStatus,
  SaleType,
} from '../sales/entities/sale.entity';
import { Return, ReturnStatus, ReturnType } from './entities/return.entity';
import {
  calculateAvailableQuantities,
  calculateMonetaryCap,
  resolveEffectiveDocument,
  validateReturnRequest,
} from './returns-engine';

function sale(overrides: Partial<Sale> = {}): Sale {
  return {
    saleID: 'sale-1',
    tenantID: 'tenant-1',
    storeID: 'store-1',
    userID: null,
    saleType: SaleType.NOTA_VENTA,
    status: SaleStatus.EMITIDA,
    paymentType: SalePaymentType.CASH,
    folio: 1,
    issueDate: new Date('2026-08-18'),
    receiver: null,
    subtotal: 2380,
    discount: 0,
    netTotal: 2000,
    taxTotal: 380,
    total: 2380,
    cogsTotal: 800,
    dteDocumentID: null,
    dteDocument: null,
    idempotencyKey: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    items: [
      {
        saleItemID: 'sale-item-1',
        tenantID: 'tenant-1',
        saleID: 'sale-1',
        storeProductID: 'sp-1',
        variationID: 'var-1',
        productName: 'Producto A',
        sku: 'SKU-1',
        quantity: 2,
        unitPrice: 1190,
        unitCost: 400,
        lineTotal: 2380,
        createdAt: new Date(),
      } as any,
    ],
    store: undefined as any,
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
    status: ReturnStatus.COMPLETADA,
    reason: null,
    discountAmount: 0,
    folio: null,
    dteDocumentID: null,
    dteDocument: null,
    issueDate: new Date('2026-08-25'),
    subtotal: 0,
    netTotal: 500,
    taxTotal: 95,
    total: 595,
    cogsTotal: 200,
    userID: null,
    approvedBy: null,
    approvedAt: null,
    completedAt: null,
    idempotencyKey: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    items: [
      {
        returnItemID: 'return-item-1',
        tenantID: 'tenant-1',
        returnID: 'ret-1',
        saleItemID: 'sale-item-1',
        storeProductID: 'sp-1',
        variationID: 'var-1',
        productName: 'Producto A',
        sku: 'SKU-1',
        quantity: 1,
        unitPrice: 1190,
        unitCost: 400,
        lineTotal: 1190,
        createdAt: new Date(),
      } as any,
    ],
    sale: undefined as any,
    ...overrides,
  } as Return;
}

describe('returns-engine', () => {
  it('resolves nota de venta sin DTE como retorno interno', () => {
    const effective = resolveEffectiveDocument(sale());
    expect(effective).toEqual({ requiresNce: false, documentType: null });
  });

  it('resolves una nota de venta convertida como DTE boleta/factura', () => {
    const converted = sale({
      dteDocumentID: 'dte-1',
      dteDocument: { documentType: 33 } as any,
    });
    expect(resolveEffectiveDocument(converted)).toEqual({
      requiresNce: true,
      documentType: 33,
    });
  });

  it('calcula saldo devolvible restando devoluciones activas', () => {
    const active = [ret({ status: ReturnStatus.APROBADA })];
    const available = calculateAvailableQuantities(sale(), active);
    expect(available.get('sale-item-1')).toBe(1);
  });

  it('valida una devolución parcial y congela precios/costos originales', () => {
    const prepared = validateReturnRequest({
      sale: sale(),
      storeID: 'store-1',
      returnType: ReturnType.PARCIAL,
      items: [{ saleItemID: 'sale-item-1', quantity: 1 }],
      activeReturns: [],
    });

    expect(prepared.items[0]).toMatchObject({
      saleItemID: 'sale-item-1',
      unitPrice: 1190,
      unitCost: 400,
      quantity: 1,
      lineTotal: 1190,
    });
    expect(prepared.total).toBe(1190);
    expect(prepared.cogsTotal).toBe(400);
    expect(prepared.netTotal).toBe(1000);
  });

  it('rechaza una devolución TOTAL sin el saldo completo', () => {
    expect(() =>
      validateReturnRequest({
        sale: sale(),
        storeID: 'store-1',
        returnType: ReturnType.TOTAL,
        items: [{ saleItemID: 'sale-item-1', quantity: 1 }],
        activeReturns: [],
      }),
    ).toThrow(BadRequestException);
  });

  it('acepta TOTAL con saldo completo restante', () => {
    const active = [ret({ status: ReturnStatus.APROBADA })];
    const prepared = validateReturnRequest({
      sale: sale(),
      storeID: 'store-1',
      returnType: ReturnType.TOTAL,
      items: [{ saleItemID: 'sale-item-1', quantity: 1 }],
      activeReturns: active,
    });
    expect(prepared.total).toBe(1190);
  });

  it('valida tope monetario de DESCUENTO contra devoluciones previas', () => {
    const active = [ret({ status: ReturnStatus.COMPLETADA, total: 595 })];
    expect(calculateMonetaryCap(sale(), active)).toBe(1785);

    expect(() =>
      validateReturnRequest({
        sale: sale(),
        storeID: 'store-1',
        returnType: ReturnType.DESCUENTO,
        discountAmount: 2000,
        reason: 'Descuento posterior',
        activeReturns: active,
      }),
    ).toThrow(BadRequestException);
  });

  it('no exige ítems físicos en DESCUENTO y exige motivo', () => {
    const prepared = validateReturnRequest({
      sale: sale(),
      storeID: 'store-1',
      returnType: ReturnType.DESCUENTO,
      discountAmount: 595,
      reason: 'Descuento posterior',
      activeReturns: [],
    });

    expect(prepared.items).toEqual([]);
    expect(prepared.total).toBe(595);
    expect(prepared.cogsTotal).toBe(0);
  });

  it('rechaza devoluciones registradas fuera de la tienda de la venta', () => {
    expect(() =>
      validateReturnRequest({
        sale: sale(),
        storeID: 'store-2',
        returnType: ReturnType.PARCIAL,
        items: [{ saleItemID: 'sale-item-1', quantity: 1 }],
        activeReturns: [],
      }),
    ).toThrow(BadRequestException);
  });
});
