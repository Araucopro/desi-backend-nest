import { Test, TestingModule } from '@nestjs/testing';
import { PurchaseOrdersService } from './purchase-orders.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  PurchaseOrder,
  PurchaseOrderCommercialStatus,
  PurchaseOrderPaymentStatus,
} from './entities/purchase-order.entity';
import { PurchaseOrderItem } from './entities/purchase-order-item.entity';
import { DataSource } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { FinancialMovementsService } from '../financial-movements/financial-movements.service';
import { ProductVariation } from '../products/entities/product-variation.entity';
import { StoreProduct } from '../relations/storeproduct/entities/storeproduct.entity';
import {
  InventoryMovement,
  InventoryMovementReason,
} from '../inventory/entities/inventory-movement.entity';

describe('PurchaseOrdersService', () => {
  let service: PurchaseOrdersService;

  const mockPurchaseOrderRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockPurchaseOrderItemRepository = {
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockDataSource = {
    transaction: jest.fn(),
  };

  const mockFinancialMovementsService = {
    recordPurchaseOrder: jest.fn().mockResolvedValue(undefined),
    removePurchaseOrder: jest.fn().mockResolvedValue(undefined),
    recordDte: jest.fn().mockResolvedValue(undefined),
    recordExpense: jest.fn().mockResolvedValue(undefined),
    removeExpense: jest.fn().mockResolvedValue(undefined),
  };

  const mockPurchaseOrder: Partial<PurchaseOrder> = {
    purchaseOrderID: 'po-uuid-1',
    tenantID: 'tenant-uuid-1',
    store: { storeID: 'store-uuid-1' } as any,
    folio: 'abc123',
    paymentStatus: PurchaseOrderPaymentStatus.PENDIENTE,
    status: PurchaseOrderCommercialStatus.PENDIENTE,
    subtotal: 1000,
    discount: 0,
    netTotal: 1000,
    tax: 190,
    total: 1190,
    totalProducts: 10,
    items: [],
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockDataSource.transaction.mockImplementation(async (cb) =>
      cb({ getRepository: () => mockPurchaseOrderRepository }),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurchaseOrdersService,
        {
          provide: getRepositoryToken(PurchaseOrder),
          useValue: mockPurchaseOrderRepository,
        },
        {
          provide: getRepositoryToken(PurchaseOrderItem),
          useValue: mockPurchaseOrderItemRepository,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
        {
          provide: FinancialMovementsService,
          useValue: mockFinancialMovementsService,
        },
      ],
    }).compile();

    service = module.get<PurchaseOrdersService>(PurchaseOrdersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return all purchase orders', async () => {
      mockPurchaseOrderRepository.find.mockResolvedValue([mockPurchaseOrder]);

      const result = await service.findAll();

      expect(result).toEqual([mockPurchaseOrder]);
      expect(mockPurchaseOrderRepository.find).toHaveBeenCalledWith({
        relations: ['store', 'items', 'items.variation'],
        order: { createdAt: 'DESC' },
      });
    });
  });

  describe('findOne', () => {
    it('should return a purchase order by ID', async () => {
      mockPurchaseOrderRepository.findOne.mockResolvedValue(mockPurchaseOrder);

      const result = await service.findOne('po-uuid-1');

      expect(result).toEqual(mockPurchaseOrder);
      expect(mockPurchaseOrderRepository.findOne).toHaveBeenCalledWith({
        where: { purchaseOrderID: 'po-uuid-1' },
        relations: ['store', 'items', 'items.variation'],
      });
    });

    it('should throw NotFoundException if purchase order not found', async () => {
      mockPurchaseOrderRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('not-found')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('should create a purchase order within a transaction', async () => {
      const mockManager = {
        findOne: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
      };

      mockDataSource.transaction.mockImplementation(async (cb) => {
        mockManager.findOne
          .mockResolvedValueOnce({ storeID: 'store-uuid-1' }) // Store
          .mockResolvedValueOnce({ variationID: 'var-1', sku: 'SKU-1' }) // Variation
          .mockResolvedValueOnce({
            purchaseOrderID: 'new-po',
            store: { storeID: 'store-uuid-1' },
            items: [],
          });

        mockManager.create
          .mockReturnValueOnce({
            purchaseOrderID: 'new-po',
            store: { storeID: 'store-uuid-1' },
          })
          .mockReturnValueOnce({ purchaseOrderItemID: 'poi-1' });

        mockManager.save.mockResolvedValue({ purchaseOrderID: 'new-po' });

        return cb(mockManager);
      });

      jest
        .spyOn(service, 'findOne')
        .mockResolvedValue(mockPurchaseOrder as PurchaseOrder);

      const result = await service.create({
        storeID: 'store-uuid-1',
        items: [{ variationID: 'var-1', quantity: 5, unitPrice: 200 }],
      });

      expect(mockDataSource.transaction).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should update a purchase order', async () => {
      const mockManager = {
        findOne: jest
          .fn()
          .mockResolvedValue({ ...mockPurchaseOrder, items: [] }),
        find: jest.fn().mockResolvedValue([]),
        save: jest.fn().mockResolvedValue(mockPurchaseOrder),
      };

      mockDataSource.transaction.mockImplementation(async (cb) =>
        cb(mockManager),
      );
      jest
        .spyOn(service, 'findOne')
        .mockResolvedValue(mockPurchaseOrder as PurchaseOrder);

      const result = await service.update('po-uuid-1', { discount: 100 });

      expect(mockDataSource.transaction).toHaveBeenCalled();
    });
  });

  describe('updateStatus', () => {
    it('should update purchase order status', async () => {
      const mockManager = {
        findOne: jest
          .fn()
          .mockResolvedValue({ ...mockPurchaseOrder, items: [] }),
        find: jest.fn().mockResolvedValue([]),
        save: jest.fn().mockResolvedValue(mockPurchaseOrder),
      };

      mockDataSource.transaction.mockImplementation(async (cb) =>
        cb(mockManager),
      );
      jest
        .spyOn(service, 'findOne')
        .mockResolvedValue(mockPurchaseOrder as PurchaseOrder);

      const result = await service.updateStatus('po-uuid-1', {
        status: PurchaseOrderCommercialStatus.ENVIADO,
      });

      expect(mockDataSource.transaction).toHaveBeenCalled();
    });
  });

  describe('payment ledger synchronization', () => {
    function buildPaidUpdateManager(options: {
      previousPaymentStatus: PurchaseOrderPaymentStatus;
      paidAt?: Date | null;
      discount?: number;
      dto?: Record<string, unknown>;
      items?: Array<{
        variation: { variationID: string };
        quantityRequested: number;
        unitPrice: number;
        subtotal: number;
      }>;
    }) {
      const item = {
        variation: { variationID: 'var-1' },
        quantityRequested: 2,
        unitPrice: 100,
        subtotal: 200,
      };
      const items = options.items ?? [item];

      return {
        findOne: jest.fn().mockImplementation(async (entity: unknown) => {
          if (entity === PurchaseOrder) {
            return {
              ...mockPurchaseOrder,
              paymentStatus: options.previousPaymentStatus,
              paidAt: options.paidAt ?? null,
              discount: options.discount ?? 0,
              store: { storeID: 'store-uuid-1' },
            };
          }
          if (entity === ProductVariation) {
            return { variationID: 'var-1' };
          }
          return {
            storeProductID: 'sp-1',
            priceCost: 100,
            stock: 5,
          };
        }),
        find: jest.fn().mockResolvedValue(items),
        create: jest.fn((_entity: unknown, values: unknown) => values),
        save: jest.fn(async (entity: unknown) => entity),
      };
    }

    it('sets paidAt and records the COMPRA movement when moving to Pagado', async () => {
      const mockManager = buildPaidUpdateManager({
        previousPaymentStatus: PurchaseOrderPaymentStatus.PENDIENTE,
      });
      mockDataSource.transaction.mockImplementation(async (cb) =>
        cb(mockManager),
      );
      jest
        .spyOn(service, 'findOne')
        .mockResolvedValue(mockPurchaseOrder as PurchaseOrder);

      await service.update('po-uuid-1', {
        paymentStatus: PurchaseOrderPaymentStatus.PAGADO,
      });

      expect(mockManager.save).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentStatus: PurchaseOrderPaymentStatus.PAGADO,
          paidAt: expect.any(Date),
        }),
      );
      expect(
        mockFinancialMovementsService.recordPurchaseOrder,
      ).toHaveBeenCalledWith(
        mockManager,
        expect.objectContaining({
          purchaseOrderID: 'po-uuid-1',
          netTotal: 200,
        }),
        expect.any(Date),
      );
      expect(
        mockFinancialMovementsService.removePurchaseOrder,
      ).not.toHaveBeenCalled();
    });

    it('clears paidAt and removes the movement when reverting from Pagado', async () => {
      const mockManager = buildPaidUpdateManager({
        previousPaymentStatus: PurchaseOrderPaymentStatus.PAGADO,
        paidAt: new Date('2026-01-10T12:00:00Z'),
      });
      mockDataSource.transaction.mockImplementation(async (cb) =>
        cb(mockManager),
      );
      jest
        .spyOn(service, 'findOne')
        .mockResolvedValue(mockPurchaseOrder as PurchaseOrder);

      await service.update('po-uuid-1', {
        paymentStatus: PurchaseOrderPaymentStatus.PENDIENTE,
      });

      expect(mockManager.save).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentStatus: PurchaseOrderPaymentStatus.PENDIENTE,
          paidAt: null,
        }),
      );
      expect(
        mockFinancialMovementsService.removePurchaseOrder,
      ).toHaveBeenCalledWith(mockManager, 'po-uuid-1');
      expect(
        mockFinancialMovementsService.recordPurchaseOrder,
      ).not.toHaveBeenCalled();
    });

    it('resynchronizes the movement when an already paid order is edited', async () => {
      const paidAt = new Date('2026-01-10T12:00:00Z');
      const mockManager = buildPaidUpdateManager({
        previousPaymentStatus: PurchaseOrderPaymentStatus.PAGADO,
        paidAt,
        discount: 50,
      });
      mockDataSource.transaction.mockImplementation(async (cb) =>
        cb(mockManager),
      );
      jest
        .spyOn(service, 'findOne')
        .mockResolvedValue(mockPurchaseOrder as PurchaseOrder);

      await service.update('po-uuid-1', { discount: 50 });

      expect(
        mockFinancialMovementsService.recordPurchaseOrder,
      ).toHaveBeenCalledWith(
        mockManager,
        expect.objectContaining({ netTotal: 150 }),
        paidAt,
      );
    });

    it('creates one PURCHASE movement per item when moving to Pagado', async () => {
      const mockManager = buildPaidUpdateManager({
        previousPaymentStatus: PurchaseOrderPaymentStatus.PENDIENTE,
        items: [
          {
            variation: { variationID: 'var-1' },
            quantityRequested: 2,
            unitPrice: 100,
            subtotal: 200,
          },
          {
            variation: { variationID: 'var-2' },
            quantityRequested: 3,
            unitPrice: 50,
            subtotal: 150,
          },
        ],
      });
      mockDataSource.transaction.mockImplementation(async (cb) =>
        cb(mockManager),
      );
      jest
        .spyOn(service, 'findOne')
        .mockResolvedValue(mockPurchaseOrder as PurchaseOrder);

      await service.update('po-uuid-1', {
        paymentStatus: PurchaseOrderPaymentStatus.PAGADO,
      });

      const movementCalls = mockManager.create.mock.calls.filter(
        ([entity]) => entity === InventoryMovement,
      );

      expect(movementCalls).toHaveLength(2);
      expect(movementCalls[0][1]).toEqual(
        expect.objectContaining({
          tenantID: 'tenant-uuid-1',
          store: { storeID: 'store-uuid-1' },
          variation: { variationID: 'var-1' },
          delta: 2,
          reason: InventoryMovementReason.PURCHASE,
          referenceID: 'po-uuid-1',
        }),
      );
      expect(movementCalls[1][1]).toEqual(
        expect.objectContaining({
          tenantID: 'tenant-uuid-1',
          store: { storeID: 'store-uuid-1' },
          variation: { variationID: 'var-2' },
          delta: 3,
          reason: InventoryMovementReason.PURCHASE,
          referenceID: 'po-uuid-1',
        }),
      );
    });

    it('creates one ADJUSTMENT movement per item when reverting from Pagado', async () => {
      const mockManager = buildPaidUpdateManager({
        previousPaymentStatus: PurchaseOrderPaymentStatus.PAGADO,
        paidAt: new Date('2026-01-10T12:00:00Z'),
      });
      mockDataSource.transaction.mockImplementation(async (cb) =>
        cb(mockManager),
      );
      jest
        .spyOn(service, 'findOne')
        .mockResolvedValue(mockPurchaseOrder as PurchaseOrder);

      await service.update('po-uuid-1', {
        paymentStatus: PurchaseOrderPaymentStatus.PENDIENTE,
      });

      const movementCalls = mockManager.create.mock.calls.filter(
        ([entity]) => entity === InventoryMovement,
      );

      expect(movementCalls).toHaveLength(1);
      expect(movementCalls[0][1]).toEqual(
        expect.objectContaining({
          tenantID: 'tenant-uuid-1',
          store: { storeID: 'store-uuid-1' },
          variation: { variationID: 'var-1' },
          delta: -2,
          reason: InventoryMovementReason.ADJUSTMENT,
          referenceID: 'po-uuid-1',
        }),
      );
      expect(
        mockFinancialMovementsService.removePurchaseOrder,
      ).toHaveBeenCalledWith(mockManager, 'po-uuid-1');
    });

    it('does not duplicate stock or movements when editing an already paid order', async () => {
      const mockManager = buildPaidUpdateManager({
        previousPaymentStatus: PurchaseOrderPaymentStatus.PAGADO,
        paidAt: new Date('2026-01-10T12:00:00Z'),
        discount: 50,
      });
      mockDataSource.transaction.mockImplementation(async (cb) =>
        cb(mockManager),
      );
      jest
        .spyOn(service, 'findOne')
        .mockResolvedValue(mockPurchaseOrder as PurchaseOrder);

      await service.update('po-uuid-1', { discount: 50 });

      const movementCalls = mockManager.create.mock.calls.filter(
        ([entity]) => entity === InventoryMovement,
      );
      expect(movementCalls).toHaveLength(0);
      expect(mockManager.save).not.toHaveBeenCalledWith(
        expect.objectContaining({ storeProductID: 'sp-1' }),
      );
      expect(
        mockFinancialMovementsService.recordPurchaseOrder,
      ).toHaveBeenCalledWith(
        mockManager,
        expect.objectContaining({ netTotal: 150 }),
        new Date('2026-01-10T12:00:00Z'),
      );
    });
  });
});
