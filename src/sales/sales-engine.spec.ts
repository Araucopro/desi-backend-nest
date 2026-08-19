import { BadRequestException } from '@nestjs/common';
import { ConvertDocumentType } from './dto/convert-sale.dto';
import { SalePaymentType, SaleType } from './entities/sale.entity';
import { DteDocumentPaymentType } from '../dte/entities/dte-document.entity';
import { CalculateCartResult } from '../pricing/dto/pricing.dto';
import {
  TAX_RATE,
  buildPreparedSale,
  createSaleId,
  resolveConversionDocumentType,
  toDateOnly,
  toDtePaymentType,
  toMoney,
  validateFacturaReceiver,
} from './sales-engine';

describe('sales-engine', () => {
  it('rounds money with two decimals', () => {
    expect(toMoney(10.005 + Number.EPSILON)).toBe(10.01);
    expect(toMoney(10.004)).toBe(10);
  });

  it('converts ISO date strings to noon dates and falls back for invalid values', () => {
    expect(toDateOnly('2026-08-06').toISOString()).toBe(
      new Date('2026-08-06T12:00:00').toISOString(),
    );
    expect(toDateOnly(new Date('2026-08-06T03:00:00Z')).toISOString()).toBe(
      new Date('2026-08-06T12:00:00').toISOString(),
    );
    expect(toDateOnly('not-a-date')).toBeInstanceOf(Date);
  });

  it('maps sale payment types to DTE payment types', () => {
    expect(toDtePaymentType(SalePaymentType.CASH)).toBe(
      DteDocumentPaymentType.CASH,
    );
    expect(toDtePaymentType(SalePaymentType.DEBIT)).toBe(
      DteDocumentPaymentType.DEBIT,
    );
    expect(toDtePaymentType(SalePaymentType.CREDIT)).toBe(
      DteDocumentPaymentType.CREDIT,
    );
  });

  it('generates unique UUID sale ids', () => {
    const first = createSaleId();
    const second = createSaleId();

    expect(first).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(second).not.toBe(first);
  });

  it('requires rut and name for facturas', () => {
    expect(() => validateFacturaReceiver(SaleType.FACTURA)).toThrow(
      BadRequestException,
    );
    expect(() =>
      validateFacturaReceiver(SaleType.FACTURA, { rut: '11111111-1' }),
    ).toThrow(BadRequestException);
    expect(() =>
      validateFacturaReceiver(SaleType.FACTURA, { name: 'Cliente' }),
    ).toThrow(BadRequestException);
    expect(() =>
      validateFacturaReceiver(SaleType.FACTURA, {
        rut: '11111111-1',
        name: 'Cliente',
      }),
    ).not.toThrow();
    expect(() => validateFacturaReceiver(SaleType.BOLETA)).not.toThrow();
  });

  it('builds a prepared sale with totals, taxes and COGS', () => {
    const pricing = {
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
      pricingContext: {},
    } as unknown as CalculateCartResult;

    const prepared = buildPreparedSale(
      {
        saleType: SaleType.NOTA_VENTA,
        paymentType: SalePaymentType.CASH,
        issueDate: '2026-08-06',
        receiver: undefined,
        items: [],
      } as any,
      pricing,
    );

    expect(prepared.saleType).toBe(SaleType.NOTA_VENTA);
    expect(prepared.items).toEqual([
      expect.objectContaining({
        storeProductID: 'sp-1',
        variationID: 'var-1',
        quantity: 2,
        unitPrice: 1190,
        unitCost: 400,
        lineTotal: 2380,
        baseTotal: 2380,
      }),
    ]);
    expect(prepared.cogsTotal).toBe(800);
    expect(prepared.total).toBe(2380);
    expect(prepared.subtotal).toBe(2380);
    expect(prepared.discount).toBe(0);
    expect(prepared.netTotal).toBe(Math.round(2380 / (1 + TAX_RATE)));
    expect(prepared.taxTotal).toBe(2380 - Math.round(2380 / (1 + TAX_RATE)));
    expect(prepared.issueDate.toISOString()).toBe(
      new Date('2026-08-06T12:00:00').toISOString(),
    );
  });

  it('computes discount and base totals from pricing lines', () => {
    const prepared = buildPreparedSale(
      {
        saleType: SaleType.BOLETA,
        paymentType: SalePaymentType.DEBIT,
        items: [],
      } as any,
      {
        items: [
          {
            storeProductID: 'sp-1',
            variationID: 'var-1',
            productID: 'product-1',
            productName: 'Producto A',
            sku: 'SKU-1',
            quantity: 1,
            baseUnitPrice: 2500,
            unitCost: 1200,
            basePrice: 2500,
            finalUnitPrice: 2000,
            lineTotal: 2000,
            discountsApplied: [],
            breakdown: [],
          },
        ],
        totals: { subtotal: 2500, discount: 500, total: 2000 },
        pricingContext: {},
      } as unknown as CalculateCartResult,
    );

    expect(prepared.subtotal).toBe(2500);
    expect(prepared.total).toBe(2000);
    expect(prepared.discount).toBe(500);
    expect(prepared.cogsTotal).toBe(1200);
  });

  it('resolves conversion document type by explicit request or receiver', () => {
    expect(
      resolveConversionDocumentType(
        {},
        { documentType: ConvertDocumentType.BOLETA },
      ),
    ).toBe(39);
    expect(
      resolveConversionDocumentType(
        {},
        { documentType: ConvertDocumentType.FACTURA },
      ),
    ).toBe(33);
    expect(resolveConversionDocumentType({ receiver: { rut: '1-9' } })).toBe(
      33,
    );
    expect(resolveConversionDocumentType({})).toBe(39);
  });
});
