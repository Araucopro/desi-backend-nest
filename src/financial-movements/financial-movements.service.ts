import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import {
  DteDocument,
  DteDocumentStatus,
} from '../dte/entities/dte-document.entity';
import { PurchaseOrder } from '../purchase-orders/entities/purchase-order.entity';
import { Expense, ExpenseType } from '../expenses/entities/expense.entity';
import {
  FinancialMovement,
  FinancialMovementCategory,
  FinancialMovementDirection,
  FinancialMovementSourceType,
} from './entities/financial-movement.entity';

export type SaleNoteLedgerInput = {
  saleID: string;
  tenantID: string;
  storeID: string;
  issueDate: Date;
  netTotal: number;
  taxTotal: number;
  cogsTotal: number;
};

/**
 * Proyección derivada del ledger financiero.
 *
 * Estas operaciones deben ejecutarse con el mismo EntityManager de la
 * transacción del documento fuente (DTE, OC o gasto) para que el ledger
 * nunca quede a medio escribir si la operación principal falla.
 */
@Injectable()
export class FinancialMovementsService {
  private toMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private async removeForSource(
    manager: EntityManager,
    sourceType: FinancialMovementSourceType,
    sourceID: string,
  ): Promise<void> {
    await manager.delete(FinancialMovement, { sourceType, sourceID });
  }

  async recordDte(manager: EntityManager, dte: DteDocument): Promise<void> {
    await this.removeForSource(
      manager,
      FinancialMovementSourceType.DTE_DOCUMENT,
      dte.dteDocumentID,
    );

    if (dte.status !== DteDocumentStatus.EMITIDO) return;

    // Solo 61 (nota de crédito) invierte el signo; 33/39/56 o nulo son ingresos.
    const sign = dte.documentType === 61 ? -1 : 1;
    const movements = [
      manager.create(FinancialMovement, {
        tenantID: dte.tenantID,
        storeID: dte.storeID,
        date: dte.issueDate,
        direction: FinancialMovementDirection.INGRESO,
        category: FinancialMovementCategory.VENTA,
        amount: this.toMoney(sign * Number(dte.netTotal)),
        taxAmount: this.toMoney(sign * Number(dte.taxTotal)),
        taxCredit: false,
        acceptedForTax: true,
        sourceType: FinancialMovementSourceType.DTE_DOCUMENT,
        sourceID: dte.dteDocumentID,
      }),
      manager.create(FinancialMovement, {
        tenantID: dte.tenantID,
        storeID: dte.storeID,
        date: dte.issueDate,
        direction: FinancialMovementDirection.EGRESO,
        category: FinancialMovementCategory.COSTO_VENTA,
        amount: this.toMoney(sign * Number(dte.cogsTotal)),
        taxAmount: 0,
        taxCredit: false,
        acceptedForTax: true,
        sourceType: FinancialMovementSourceType.DTE_DOCUMENT,
        sourceID: dte.dteDocumentID,
      }),
    ];

    await manager.save(movements);
  }

  async recordPurchaseOrder(
    manager: EntityManager,
    purchaseOrder: PurchaseOrder,
    date: Date,
  ): Promise<void> {
    await this.removeForSource(
      manager,
      FinancialMovementSourceType.PURCHASE_ORDER,
      purchaseOrder.purchaseOrderID,
    );

    const storeID = purchaseOrder.store?.storeID;
    if (!storeID) {
      throw new Error(
        'PurchaseOrder.store es requerida para registrar el movimiento financiero',
      );
    }

    await manager.save(
      manager.create(FinancialMovement, {
        tenantID: purchaseOrder.tenantID,
        storeID,
        date,
        direction: FinancialMovementDirection.EGRESO,
        category: FinancialMovementCategory.COMPRA,
        amount: this.toMoney(Number(purchaseOrder.netTotal)),
        taxAmount: this.toMoney(Number(purchaseOrder.tax)),
        taxCredit: true,
        acceptedForTax: true,
        sourceType: FinancialMovementSourceType.PURCHASE_ORDER,
        sourceID: purchaseOrder.purchaseOrderID,
      }),
    );
  }

  async removePurchaseOrder(
    manager: EntityManager,
    purchaseOrderID: string,
  ): Promise<void> {
    await this.removeForSource(
      manager,
      FinancialMovementSourceType.PURCHASE_ORDER,
      purchaseOrderID,
    );
  }

  async recordExpense(manager: EntityManager, expense: Expense): Promise<void> {
    await this.removeForSource(
      manager,
      FinancialMovementSourceType.EXPENSE,
      expense.id,
    );

    const storeID = expense.store?.storeID;
    if (!storeID) {
      throw new Error(
        'Expense.store es requerida para registrar el movimiento financiero',
      );
    }

    await manager.save(
      manager.create(FinancialMovement, {
        tenantID: expense.tenantID,
        storeID,
        date: expense.deductibleDate,
        direction: FinancialMovementDirection.EGRESO,
        category: this.expenseCategory(expense.type),
        amount: this.toMoney(Number(expense.netAmount)),
        taxAmount: this.toMoney(Number(expense.taxAmount)),
        taxCredit: expense.taxCredit,
        acceptedForTax: expense.acceptedForTax,
        sourceType: FinancialMovementSourceType.EXPENSE,
        sourceID: expense.id,
      }),
    );
  }

  async removeExpense(
    manager: EntityManager,
    expenseID: string,
  ): Promise<void> {
    await this.removeForSource(
      manager,
      FinancialMovementSourceType.EXPENSE,
      expenseID,
    );
  }

  private expenseCategory(type: ExpenseType): FinancialMovementCategory {
    switch (type) {
      case ExpenseType.OPERATIONAL:
        return FinancialMovementCategory.GASTO_OPERACIONAL;
      case ExpenseType.ADMINISTRATIVE:
        return FinancialMovementCategory.GASTO_ADMINISTRATIVO;
      case ExpenseType.FINANCIAL:
        return FinancialMovementCategory.GASTO_FINANCIERO;
    }
  }

  /**
   * Ledger de nota de venta interna: ingreso por venta (neto + IVA) y
   * egreso por costo de venta, ambos con sourceType SALE_NOTE.
   */
  async recordSaleNote(
    manager: EntityManager,
    sale: SaleNoteLedgerInput,
  ): Promise<void> {
    await this.removeForSource(
      manager,
      FinancialMovementSourceType.SALE_NOTE,
      sale.saleID,
    );

    await manager.save([
      manager.create(FinancialMovement, {
        tenantID: sale.tenantID,
        storeID: sale.storeID,
        date: sale.issueDate,
        direction: FinancialMovementDirection.INGRESO,
        category: FinancialMovementCategory.VENTA,
        amount: this.toMoney(Number(sale.netTotal)),
        taxAmount: this.toMoney(Number(sale.taxTotal)),
        taxCredit: false,
        acceptedForTax: true,
        sourceType: FinancialMovementSourceType.SALE_NOTE,
        sourceID: sale.saleID,
      }),
      manager.create(FinancialMovement, {
        tenantID: sale.tenantID,
        storeID: sale.storeID,
        date: sale.issueDate,
        direction: FinancialMovementDirection.EGRESO,
        category: FinancialMovementCategory.COSTO_VENTA,
        amount: this.toMoney(Number(sale.cogsTotal)),
        taxAmount: 0,
        taxCredit: false,
        acceptedForTax: true,
        sourceType: FinancialMovementSourceType.SALE_NOTE,
        sourceID: sale.saleID,
      }),
    ]);
  }

  async removeSaleNote(manager: EntityManager, saleID: string): Promise<void> {
    await this.removeForSource(
      manager,
      FinancialMovementSourceType.SALE_NOTE,
      saleID,
    );
  }

  /**
   * Ledger de reverso de nota de venta: anula el ingreso por venta y el
   * costo de venta registrados originalmente (montos negativos).
   */
  async recordReturnForSaleNote(
    manager: EntityManager,
    ret: {
      returnID: string;
      tenantID: string;
      storeID: string;
      issueDate: Date;
      netTotal: number;
      taxTotal: number;
      cogsTotal: number;
    },
  ): Promise<void> {
    await this.removeForSource(
      manager,
      FinancialMovementSourceType.RETURN,
      ret.returnID,
    );

    await manager.save([
      manager.create(FinancialMovement, {
        tenantID: ret.tenantID,
        storeID: ret.storeID,
        date: ret.issueDate,
        direction: FinancialMovementDirection.INGRESO,
        category: FinancialMovementCategory.VENTA,
        amount: this.toMoney(-Number(ret.netTotal)),
        taxAmount: this.toMoney(-Number(ret.taxTotal)),
        taxCredit: false,
        acceptedForTax: true,
        sourceType: FinancialMovementSourceType.RETURN,
        sourceID: ret.returnID,
      }),
      manager.create(FinancialMovement, {
        tenantID: ret.tenantID,
        storeID: ret.storeID,
        date: ret.issueDate,
        direction: FinancialMovementDirection.EGRESO,
        category: FinancialMovementCategory.COSTO_VENTA,
        amount: this.toMoney(-Number(ret.cogsTotal)),
        taxAmount: 0,
        taxCredit: false,
        acceptedForTax: true,
        sourceType: FinancialMovementSourceType.RETURN,
        sourceID: ret.returnID,
      }),
    ]);
  }
}
