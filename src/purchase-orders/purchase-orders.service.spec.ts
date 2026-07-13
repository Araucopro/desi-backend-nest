import { Test, TestingModule } from '@nestjs/testing';
import { PurchaseOrdersService } from './purchase-orders.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PurchaseOrder } from './entities/purchase-order.entity';
import { PurchaseOrderItem } from './entities/purchase-order-item.entity';
import { DataSource, Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';

describe('PurchaseOrdersService', () => {
  let service: PurchaseOrdersService;
  let purchaseOrderRepository: Repository<PurchaseOrder>;

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

  const mockPurchaseOrder: Partial<PurchaseOrder> = {
    purchaseOrderID: 'po-uuid-1',
    store: { storeID: 'store-uuid-1' } as any,
    folio: 'abc123',
    paymentStatus: 'Pendiente',
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
      ],
    }).compile();

    service = module.get<PurchaseOrdersService>(PurchaseOrdersService);
    purchaseOrderRepository = module.get<Repository<PurchaseOrder>>(
      getRepositoryToken(PurchaseOrder),
    );
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
        status: 'Pagado',
      });

      expect(mockDataSource.transaction).toHaveBeenCalled();
    });
  });
});
