import { BadGatewayException } from '@nestjs/common';
import {
  Sale,
  SalePaymentType,
  SaleStatus,
  SaleType,
} from '../sales/entities/sale.entity';
import { DteDocumentStatus } from '../dte/entities/dte-document.entity';
import { InventoryMovementReason } from '../inventory/entities/inventory-movement.entity';
import { Return, ReturnStatus, ReturnType } from './entities/return.entity';
import { ReturnItemCondition } from './entities/return-item.entity';
import { ReturnFolioCounter } from './entities/return-folio-counter.entity';
import { ReturnsService } from './returns.service';

function createContext() {
  const sale: Partial<Sale> = {
    saleID: 'sale-1',
    tenantID: 'tenant-1',
    storeID: 'store-1',
    saleType: SaleType.NOTA_VENTA,
    status: SaleStatus.EMITIDA,
    paymentType: SalePaymentType.CASH,
    folio: 1,
    issueDate: new Date('2026-08-18'),
    receiver: null,
    total: 2380,
    netTotal: 2000,
    taxTotal: 380,
    cogsTotal: 800,
    dteDocumentID: null,
    dteDocument: null,
    items: [
      {
        saleItemID: 'sale-item-1',
        storeProductID: 'sp-1',
        variationID: 'var-1',
        productName: 'Producto A',
        sku: 'SKU-1',
        quantity: 2,
        unitPrice: 1190,
        unitCost: 400,
        lineTotal: 2380,
      },
    ] as any,
  };

  let retState: Partial<Return> = {
    returnID: 'ret-1',
    tenantID: 'tenant-1',
    storeID: 'store-1',
    saleID: 'sale-1',
    returnType: ReturnType.PARCIAL,
    status: ReturnStatus.PENDIENTE,
    reason: null,
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
    userID: 'user-1',
    approvedBy: null,
    approvedAt: null,
    completedAt: null,
    idempotencyKey: null,
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
      },
    ] as any,
    sale: sale as Sale,
    store: {
      storeID: 'store-1',
      name: 'Tienda',
      rut: '1-9',
      location: 'X',
    } as any,
  };

  let folioCounter: Partial<ReturnFolioCounter> = {
    returnFolioCounterID: 'counter-1',
    tenantID: 'tenant-1',
    storeID: 'store-1',
    currentFolio: 0,
  };

  const activeReturns: Return[] = [];
  const saved: unknown[] = [];

  const manager: any = {
    findOne: jest.fn(async (entity: unknown, options?: unknown) => {
      const where = (options as { where?: Record<string, unknown> } | undefined)
        ?.where;
      if (entity === Return) {
        if (where?.idempotencyKey) return null;
        if (where?.returnID) return retState;
        return retState;
      }
      if (entity === Sale) return sale;
      if (entity === ReturnFolioCounter) return folioCounter;
      return null;
    }),
    getRepository: jest.fn((entity: unknown) => {
      if (entity === Return) {
        return {
          findOne: (options?: unknown) => manager.findOne(Return, options),
          find: jest.fn(async (options?: unknown) => {
            const where = (options as { where?: unknown } | undefined)?.where;
            if (
              Array.isArray(where) ||
              (where as { dteDocumentID?: string } | undefined)
                ?.dteDocumentID ||
              (where as { idempotencyKey?: string } | undefined)?.idempotencyKey
            ) {
              return [retState];
            }
            return activeReturns;
          }),
        };
      }
      if (entity === Sale) {
        return {
          findOne: (options?: unknown) => manager.findOne(Sale, options),
        };
      }
      if (entity === ReturnFolioCounter) {
        return {
          findOne: (options?: unknown) =>
            manager.findOne(ReturnFolioCounter, options),
        };
      }
      return {};
    }),
    create: jest.fn((_entity: unknown, values: object) => ({ ...values })),
    save: jest.fn(async (entity: unknown) => {
      const record = entity as Record<string, unknown>;
      if (record.returnID) {
        Object.assign(retState, record);
        retState = { ...retState } as Partial<Return>;
      }
      if (record.currentFolio !== undefined) {
        folioCounter = record as Partial<ReturnFolioCounter>;
      }
      saved.push(entity);
      return entity;
    }),
    query: jest.fn().mockResolvedValue(undefined),
  };

  const inventoryService = {
    applyMovement: jest.fn().mockResolvedValue({}),
  };
  const financialMovementsService = {
    recordReturnForSaleNote: jest.fn().mockResolvedValue(undefined),
  };
  const dteService = {
    create: jest.fn(),
    reconcile: jest.fn(),
    registerFinalizedListener: jest.fn(),
    registerFailedListener: jest.fn(),
  };
  const mapper = {
    mapReturnToNce: jest.fn().mockReturnValue({}),
  };
  const dataSource = {
    transaction: jest.fn(async (cb: (manager: unknown) => Promise<unknown>) =>
      cb(manager),
    ),
  };

  const service = new ReturnsService(
    {} as any,
    {} as any,
    {} as any,
    dataSource as any,
    dteService as any,
    mapper as any,
    inventoryService as any,
    financialMovementsService as any,
  );

  return {
    manager,
    service,
    sale,
    ret: () => retState,
    setReturn: (patch: Partial<Return>) => {
      Object.assign(retState, patch);
    },
    setSale: (patch: Partial<Sale>) => {
      Object.assign(sale, patch);
    },
    activeReturns,
    inventoryService,
    financialMovementsService,
    dteService,
    mapper,
    saved,
  };
}

describe('ReturnsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('crea una devolución PENDIENTE y congela ítems', async () => {
    const ctx = createContext();
    const result = await ctx.service.create(
      'store-1',
      'idem-1',
      {
        saleID: 'sale-1',
        returnType: ReturnType.PARCIAL,
        items: [{ saleItemID: 'sale-item-1', quantity: 1 }],
      } as any,
      'user-1',
    );

    expect(result.ret.status).toBe(ReturnStatus.PENDIENTE);
    expect(
      ctx.saved.some((record) => (record as { returnID?: string }).returnID),
    ).toBe(true);
    expect(ctx.inventoryService.applyMovement).not.toHaveBeenCalled();
  });

  it('aprueba nota de venta sin DTE: reintegra stock y registra ledger negativo', async () => {
    const ctx = createContext();

    const result = await ctx.service.approve('ret-1', 'store-1', 'admin-1');

    expect(ctx.ret().status).toBe(ReturnStatus.COMPLETADA);
    expect(ctx.ret().folio).toBe(1);
    expect(ctx.inventoryService.applyMovement).toHaveBeenCalledWith(
      ctx.manager,
      expect.objectContaining({
        reason: InventoryMovementReason.RETURN,
        quantity: 1,
        referenceID: 'ret-1',
      }),
    );
    expect(
      ctx.financialMovementsService.recordReturnForSaleNote,
    ).toHaveBeenCalledWith(
      ctx.manager,
      expect.objectContaining({
        returnID: 'ret-1',
        netTotal: 1000,
        taxTotal: 190,
        cogsTotal: 400,
      }),
    );
    expect(result.dte).toBeNull();
  });

  it('aprueba boleta: emite NCE 61 y completa con reintegro sin ledger de nota', async () => {
    const ctx = createContext();
    ctx.setSale({
      saleType: SaleType.BOLETA,
      dteDocumentID: 'dte-original',
      dteDocument: {
        documentType: 39,
        folio: 100,
      } as any,
    });
    ctx.dteService.create.mockResolvedValue({
      dteDocumentID: 'dte-9',
      TOKEN: 'token-9',
      FOLIO: 999,
      STATUS: DteDocumentStatus.EMITIDO,
    });

    const result = await ctx.service.approve('ret-1', 'store-1', 'admin-1');

    expect(ctx.mapper.mapReturnToNce).toHaveBeenCalledWith(
      expect.objectContaining({ originalDocumentType: 39, codRef: 3 }),
    );
    expect(ctx.dteService.create).toHaveBeenCalledWith(
      'store-1',
      'ret-1',
      {},
      {
        reserveStock: false,
        cogsTotalOverride: 400,
      },
    );
    expect(ctx.ret().status).toBe(ReturnStatus.COMPLETADA);
    expect(ctx.ret().dteDocumentID).toBe('dte-9');
    expect(ctx.inventoryService.applyMovement).toHaveBeenCalledTimes(1);
    expect(
      ctx.financialMovementsService.recordReturnForSaleNote,
    ).not.toHaveBeenCalled();
    expect(result.dte).toMatchObject({ dteDocumentID: 'dte-9' });
  });

  it('mantiene APROBADA cuando la NCE queda PENDIENTE', async () => {
    const ctx = createContext();
    ctx.setSale({
      saleType: SaleType.FACTURA,
      receiver: { rut: '76123456-7', name: 'Cliente SpA' },
      dteDocumentID: 'dte-original',
      dteDocument: {
        documentType: 33,
        folio: 200,
      } as any,
    });
    ctx.dteService.create.mockResolvedValue({
      dteDocumentID: 'dte-10',
      TOKEN: 'token-10',
      FOLIO: 0,
      STATUS: DteDocumentStatus.PENDIENTE,
    });

    await ctx.service.approve('ret-1', 'store-1', 'admin-1');

    expect(ctx.ret().status).toBe(ReturnStatus.APROBADA);
    expect(ctx.ret().dteDocumentID).toBe('dte-10');
    expect(ctx.inventoryService.applyMovement).not.toHaveBeenCalled();
  });

  it('deja PENDIENTE y propaga el error cuando la emisión NCE falla', async () => {
    const ctx = createContext();
    ctx.setSale({
      saleType: SaleType.BOLETA,
      dteDocumentID: 'dte-original',
      dteDocument: {
        documentType: 39,
        folio: 100,
      } as any,
    });
    ctx.dteService.create.mockRejectedValue(
      new BadGatewayException('Openfactura no pudo emitir'),
    );

    await expect(
      ctx.service.approve('ret-1', 'store-1', 'admin-1'),
    ).rejects.toThrow(BadGatewayException);
    expect(ctx.ret().status).toBe(ReturnStatus.PENDIENTE);
    expect(ctx.inventoryService.applyMovement).not.toHaveBeenCalled();
    expect(
      ctx.financialMovementsService.recordReturnForSaleNote,
    ).not.toHaveBeenCalled();
  });

  it('vuelve APROBADA a PENDIENTE y limpia la aprobación cuando el DTE falla', async () => {
    const ctx = createContext();
    let failedListener:
      | ((manager: unknown, document: unknown) => Promise<void>)
      | undefined;
    ctx.dteService.registerFailedListener.mockImplementation(
      (fn: typeof failedListener) => {
        failedListener = fn;
      },
    );
    ctx.service.onModuleInit();

    ctx.setReturn({
      status: ReturnStatus.APROBADA,
      dteDocumentID: 'dte-10',
      approvedBy: 'admin-1',
      approvedAt: new Date('2026-08-25T10:00:00Z'),
    } as Partial<Return>);

    await failedListener!(ctx.manager, {
      status: DteDocumentStatus.ERROR,
      dteDocumentID: 'dte-10',
      idempotencyKey: 'ret-1',
    });

    expect(ctx.ret().status).toBe(ReturnStatus.PENDIENTE);
    expect(ctx.ret().approvedBy).toBeNull();
    expect(ctx.ret().approvedAt).toBeNull();
    expect(ctx.ret().dteDocumentID).toBe('dte-10');
    expect(ctx.inventoryService.applyMovement).not.toHaveBeenCalled();
  });

  it('reconcilia ERROR sin propagar 502 y permite re-aprobar sobre la misma fila', async () => {
    const ctx = createContext();
    ctx.setSale({
      saleType: SaleType.BOLETA,
      dteDocumentID: 'dte-original',
      dteDocument: {
        documentType: 39,
        folio: 100,
      } as any,
    });
    ctx.setReturn({
      status: ReturnStatus.APROBADA,
      dteDocumentID: 'dte-10',
      approvedBy: 'admin-1',
      approvedAt: new Date('2026-08-25T10:00:00Z'),
    } as Partial<Return>);
    ctx.dteService.reconcile.mockImplementation(async () => {
      // Simula el listener de fallo ya commiteado dentro de reconcile.
      ctx.setReturn({
        status: ReturnStatus.PENDIENTE,
        approvedBy: null,
        approvedAt: null,
      } as Partial<Return>);
      throw new BadGatewayException('Openfactura reportó estado ERROR');
    });

    const reconciled = await ctx.service.reconcile('ret-1', 'store-1');
    expect(reconciled.ret.status).toBe(ReturnStatus.PENDIENTE);
    expect(ctx.ret().dteDocumentID).toBe('dte-10');

    ctx.dteService.create.mockResolvedValue({
      dteDocumentID: 'dte-10',
      TOKEN: 'token-new',
      FOLIO: 300,
      STATUS: DteDocumentStatus.EMITIDO,
    });
    const result = await ctx.service.approve('ret-1', 'store-1', 'admin-1');
    expect(ctx.ret().status).toBe(ReturnStatus.COMPLETADA);
    expect(ctx.ret().dteDocumentID).toBe('dte-10');
    expect(ctx.dteService.create).toHaveBeenCalledWith(
      'store-1',
      'ret-1',
      {},
      { reserveStock: false, cogsTotalOverride: 400 },
    );
    expect(result.dte).toMatchObject({ dteDocumentID: 'dte-10' });
  });

  it('reintegra ítem DEFECTIVE al bucket de stock defectuoso', async () => {
    const ctx = createContext();
    ctx.setReturn({
      items: [
        {
          ...ctx.ret().items![0],
          condition: ReturnItemCondition.DEFECTIVE,
        },
      ],
    } as Partial<Return>);

    await ctx.service.approve('ret-1', 'store-1', 'admin-1');

    expect(ctx.inventoryService.applyMovement).toHaveBeenCalledWith(
      ctx.manager,
      expect.objectContaining({
        reason: InventoryMovementReason.RETURN,
        condition: ReturnItemCondition.DEFECTIVE,
      }),
    );
  });

  it('reconcilia una NCE pendiente y completa el retorno', async () => {
    const ctx = createContext();
    ctx.setSale({
      saleType: SaleType.FACTURA,
      receiver: { rut: '76123456-7', name: 'Cliente SpA' },
      dteDocumentID: 'dte-original',
      dteDocument: {
        documentType: 33,
        folio: 200,
      } as any,
    });
    ctx.setReturn({
      status: ReturnStatus.APROBADA,
      dteDocumentID: 'dte-10',
    } as Partial<Return>);
    ctx.dteService.reconcile.mockResolvedValue({
      dteDocumentID: 'dte-10',
      TOKEN: 'token-10',
      FOLIO: 300,
      STATUS: DteDocumentStatus.EMITIDO,
    });

    const result = await ctx.service.reconcile('ret-1', 'store-1');

    expect(ctx.dteService.reconcile).toHaveBeenCalledWith('dte-10', 'store-1');
    expect(ctx.ret().status).toBe(ReturnStatus.COMPLETADA);
    expect(ctx.inventoryService.applyMovement).toHaveBeenCalledTimes(1);
    expect(result.dte).toMatchObject({ dteDocumentID: 'dte-10' });
  });

  it('es idempotente al completar: no reintegra dos veces', async () => {
    const ctx = createContext();
    await ctx.service.approve('ret-1', 'store-1', 'admin-1');
    expect(ctx.inventoryService.applyMovement).toHaveBeenCalledTimes(1);

    await ctx.service.approve('ret-1', 'store-1', 'admin-1');
    expect(ctx.inventoryService.applyMovement).toHaveBeenCalledTimes(1);
    expect(
      ctx.financialMovementsService.recordReturnForSaleNote,
    ).toHaveBeenCalledTimes(1);
  });

  it('rechaza y cancela solo desde PENDIENTE', async () => {
    const ctx = createContext();
    await ctx.service.reject('ret-1', 'store-1');
    expect(ctx.ret().status).toBe(ReturnStatus.RECHAZADA);

    ctx.setReturn({ status: ReturnStatus.PENDIENTE } as Partial<Return>);
    await ctx.service.cancel('ret-1', 'store-1');
    expect(ctx.ret().status).toBe(ReturnStatus.CANCELADA);
  });

  it('completa vía hook del DTE aunque la NCE finalice antes de asociar el returnID', async () => {
    const ctx = createContext();
    let listener:
      | ((manager: unknown, document: unknown) => Promise<void>)
      | undefined;
    ctx.dteService.registerFinalizedListener.mockImplementation(
      (fn: typeof listener) => {
        listener = fn;
      },
    );
    ctx.service.onModuleInit();

    await listener!(ctx.manager, {
      status: DteDocumentStatus.EMITIDO,
      dteDocumentID: 'dte-9',
      idempotencyKey: 'ret-1',
    });

    expect(ctx.ret().status).toBe(ReturnStatus.COMPLETADA);
    expect(ctx.ret().dteDocumentID).toBe('dte-9');
    expect(ctx.inventoryService.applyMovement).toHaveBeenCalledTimes(1);
  });
});
