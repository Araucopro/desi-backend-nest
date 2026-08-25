import { FinancialMovementsService } from './financial-movements.service';
import {
  FinancialMovement,
  FinancialMovementCategory,
  FinancialMovementDirection,
  FinancialMovementSourceType,
} from './entities/financial-movement.entity';
import { DteDocumentStatus } from '../dte/entities/dte-document.entity';
import { ExpenseType } from '../expenses/entities/expense.entity';

describe('FinancialMovementsService', () => {
  let service: FinancialMovementsService;
  let manager: {
    create: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    manager = {
      create: jest.fn((_entity: unknown, values: unknown) => ({
        ...(values as object),
      })),
      save: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    service = new FinancialMovementsService();
  });

  it('records VENTA and COSTO_VENTA for an emitted DTE', async () => {
    const dte = {
      dteDocumentID: 'dte-1',
      tenantID: 'tenant-1',
      storeID: 'store-1',
      issueDate: new Date('2026-01-15'),
      status: DteDocumentStatus.EMITIDO,
      documentType: 33,
      netTotal: 1000,
      taxTotal: 190,
      cogsTotal: 400,
    };

    await service.recordDte(manager as any, dte as any);

    expect(manager.delete).toHaveBeenCalledWith(FinancialMovement, {
      sourceType: FinancialMovementSourceType.DTE_DOCUMENT,
      sourceID: 'dte-1',
    });
    expect(manager.create).toHaveBeenCalledTimes(2);
    expect(manager.save).toHaveBeenCalledWith([
      expect.objectContaining({
        tenantID: 'tenant-1',
        storeID: 'store-1',
        date: dte.issueDate,
        direction: FinancialMovementDirection.INGRESO,
        category: FinancialMovementCategory.VENTA,
        amount: 1000,
        taxAmount: 190,
        taxCredit: false,
        sourceType: FinancialMovementSourceType.DTE_DOCUMENT,
        sourceID: 'dte-1',
      }),
      expect.objectContaining({
        direction: FinancialMovementDirection.EGRESO,
        category: FinancialMovementCategory.COSTO_VENTA,
        amount: 400,
        taxAmount: 0,
      }),
    ]);
  });

  it('inverts the sign for nota de crédito 61', async () => {
    const dte = {
      dteDocumentID: 'dte-2',
      tenantID: 'tenant-1',
      storeID: 'store-1',
      issueDate: new Date('2026-01-15'),
      status: DteDocumentStatus.EMITIDO,
      documentType: 61,
      netTotal: 500,
      taxTotal: 95,
      cogsTotal: 200,
    };

    await service.recordDte(manager as any, dte as any);

    expect(manager.save).toHaveBeenCalledWith([
      expect.objectContaining({
        category: FinancialMovementCategory.VENTA,
        amount: -500,
        taxAmount: -95,
      }),
      expect.objectContaining({
        category: FinancialMovementCategory.COSTO_VENTA,
        amount: -200,
      }),
    ]);
  });

  it('does not record movements when the DTE is not EMITIDO', async () => {
    const dte = {
      dteDocumentID: 'dte-3',
      tenantID: 'tenant-1',
      storeID: 'store-1',
      issueDate: new Date('2026-01-15'),
      status: DteDocumentStatus.ERROR,
      documentType: 33,
      netTotal: 100,
      taxTotal: 19,
      cogsTotal: 40,
    };

    await service.recordDte(manager as any, dte as any);

    expect(manager.save).not.toHaveBeenCalled();
  });

  it('records COMPRA with tax credit for a paid purchase order', async () => {
    const purchaseOrder = {
      purchaseOrderID: 'po-1',
      tenantID: 'tenant-1',
      store: { storeID: 'store-1' },
      netTotal: 800,
      tax: 152,
    };

    await service.recordPurchaseOrder(
      manager as any,
      purchaseOrder as any,
      new Date('2026-02-01'),
    );

    expect(manager.delete).toHaveBeenCalledWith(FinancialMovement, {
      sourceType: FinancialMovementSourceType.PURCHASE_ORDER,
      sourceID: 'po-1',
    });
    expect(manager.save).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantID: 'tenant-1',
        storeID: 'store-1',
        date: new Date('2026-02-01'),
        direction: FinancialMovementDirection.EGRESO,
        category: FinancialMovementCategory.COMPRA,
        amount: 800,
        taxAmount: 152,
        taxCredit: true,
      }),
    );
  });

  it('removes all movements of a purchase order', async () => {
    await service.removePurchaseOrder(manager as any, 'po-1');

    expect(manager.delete).toHaveBeenCalledWith(FinancialMovement, {
      sourceType: FinancialMovementSourceType.PURCHASE_ORDER,
      sourceID: 'po-1',
    });
  });

  it('maps expense type to the ledger category with tax flags', async () => {
    const expense = {
      id: 'expense-1',
      tenantID: 'tenant-1',
      store: { storeID: 'store-1' },
      deductibleDate: new Date('2026-03-01'),
      type: ExpenseType.OPERATIONAL,
      netAmount: 120,
      taxAmount: 22.8,
      taxCredit: true,
      acceptedForTax: false,
    };

    await service.recordExpense(manager as any, expense as any);

    expect(manager.save).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantID: 'tenant-1',
        storeID: 'store-1',
        date: new Date('2026-03-01'),
        direction: FinancialMovementDirection.EGRESO,
        category: FinancialMovementCategory.GASTO_OPERACIONAL,
        amount: 120,
        taxAmount: 22.8,
        taxCredit: true,
        acceptedForTax: false,
        sourceType: FinancialMovementSourceType.EXPENSE,
        sourceID: 'expense-1',
      }),
    );
  });

  it('removes all movements of an expense', async () => {
    await service.removeExpense(manager as any, 'expense-1');

    expect(manager.delete).toHaveBeenCalledWith(FinancialMovement, {
      sourceType: FinancialMovementSourceType.EXPENSE,
      sourceID: 'expense-1',
    });
  });

  it('records VENTA and COSTO_VENTA for a nota de venta', async () => {
    const sale = {
      saleID: 'sale-1',
      tenantID: 'tenant-1',
      storeID: 'store-1',
      issueDate: new Date('2026-08-06'),
      netTotal: 840.34,
      taxTotal: 159.66,
      cogsTotal: 400,
    };

    await service.recordSaleNote(manager as any, sale as any);

    expect(manager.delete).toHaveBeenCalledWith(FinancialMovement, {
      sourceType: FinancialMovementSourceType.SALE_NOTE,
      sourceID: 'sale-1',
    });
    expect(manager.save).toHaveBeenCalledWith([
      expect.objectContaining({
        direction: FinancialMovementDirection.INGRESO,
        category: FinancialMovementCategory.VENTA,
        amount: 840.34,
        taxAmount: 159.66,
        sourceType: FinancialMovementSourceType.SALE_NOTE,
        sourceID: 'sale-1',
      }),
      expect.objectContaining({
        direction: FinancialMovementDirection.EGRESO,
        category: FinancialMovementCategory.COSTO_VENTA,
        amount: 400,
        taxAmount: 0,
        sourceType: FinancialMovementSourceType.SALE_NOTE,
        sourceID: 'sale-1',
      }),
    ]);
  });

  it('removes all movements of a nota de venta', async () => {
    await service.removeSaleNote(manager as any, 'sale-1');

    expect(manager.delete).toHaveBeenCalledWith(FinancialMovement, {
      sourceType: FinancialMovementSourceType.SALE_NOTE,
      sourceID: 'sale-1',
    });
  });

  it('records negative VENTA and COSTO_VENTA for a returned nota de venta', async () => {
    const ret = {
      returnID: 'return-1',
      tenantID: 'tenant-1',
      storeID: 'store-1',
      issueDate: new Date('2026-08-25'),
      netTotal: 840.34,
      taxTotal: 159.66,
      cogsTotal: 400,
    };

    await service.recordReturnForSaleNote(manager as any, ret as any);

    expect(manager.delete).toHaveBeenCalledWith(FinancialMovement, {
      sourceType: FinancialMovementSourceType.RETURN,
      sourceID: 'return-1',
    });
    expect(manager.save).toHaveBeenCalledWith([
      expect.objectContaining({
        direction: FinancialMovementDirection.INGRESO,
        category: FinancialMovementCategory.VENTA,
        amount: -840.34,
        taxAmount: -159.66,
        sourceType: FinancialMovementSourceType.RETURN,
        sourceID: 'return-1',
      }),
      expect.objectContaining({
        direction: FinancialMovementDirection.EGRESO,
        category: FinancialMovementCategory.COSTO_VENTA,
        amount: -400,
        sourceType: FinancialMovementSourceType.RETURN,
        sourceID: 'return-1',
      }),
    ]);
  });
});
