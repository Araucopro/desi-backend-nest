import { Test, TestingModule } from '@nestjs/testing';
import { SalesService } from './sales.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Sale } from './entities/sale.entity';
import { SaleProduct } from './entities/sale-product.entity';
import { DataSource, Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';

describe('SalesService', () => {
  let service: SalesService;
  let saleRepository: Repository<Sale>;

  const mockSaleRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockSaleProductRepository = {
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockDataSource = {
    transaction: jest.fn(),
  };

  const mockSale: Partial<Sale> = {
    saleID: 'sale-uuid-1',
    store: { storeID: 'store-uuid-1' } as any,
    paymentType: 'Efectivo',
    status: 'Pendiente',
    total: 1000,
    saleProducts: [],
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesService,
        {
          provide: getRepositoryToken(Sale),
          useValue: mockSaleRepository,
        },
        {
          provide: getRepositoryToken(SaleProduct),
          useValue: mockSaleProductRepository,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<SalesService>(SalesService);
    saleRepository = module.get<Repository<Sale>>(getRepositoryToken(Sale));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return all sales', async () => {
      mockSaleRepository.find.mockResolvedValue([mockSale]);

      const result = await service.findAll();

      expect(result).toEqual([mockSale]);
      expect(mockSaleRepository.find).toHaveBeenCalledWith({
        relations: ['store', 'saleProducts', 'saleProducts.variation'],
        order: { createdAt: 'DESC' },
      });
    });
  });

  describe('findOne', () => {
    it('should return a sale by ID', async () => {
      mockSaleRepository.findOne.mockResolvedValue(mockSale);

      const result = await service.findOne('sale-uuid-1');

      expect(result).toEqual(mockSale);
      expect(mockSaleRepository.findOne).toHaveBeenCalledWith({
        where: { saleID: 'sale-uuid-1' },
        relations: ['store', 'saleProducts', 'saleProducts.variation'],
      });
    });

    it('should throw NotFoundException if sale not found', async () => {
      mockSaleRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('not-found')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateStatus', () => {
    it('should update sale status', async () => {
      mockSaleRepository.findOne.mockResolvedValue({ ...mockSale });
      mockSaleRepository.save.mockResolvedValue({
        ...mockSale,
        status: 'Completado',
      });

      const result = await service.updateStatus('sale-uuid-1', {
        status: 'Pagado',
      });

      expect(mockSaleRepository.save).toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('should create a sale from Central Store and deduct from ProductVariation', async () => {
      const mockManager = {
        findOne: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
      };

      mockDataSource.transaction.mockImplementation(async (cb) => {
        mockManager.findOne
          .mockResolvedValueOnce({
            store: { storeID: 'store-central' },
            isCentralStore: true,
          })
          .mockResolvedValueOnce({
            variationID: 'var-1',
            stock: 100,
            sku: 'SKU-1',
          })
          .mockResolvedValueOnce({
            store: { storeID: 'store-central' },
            variationID: 'var-1',
            stock: 95,
          })
          .mockResolvedValueOnce({
            saleID: 'new-sale',
            store: { storeID: 'store-central' },
            saleProducts: [],
          });

        mockManager.create.mockImplementation((entity, data) => data);
        mockManager.save.mockImplementation(async (value) => value);

        return cb(mockManager);
      });

      const result = await service.create({
        storeID: 'store-central',
        paymentType: 'Efectivo',
        items: [{ variationID: 'var-1', quantity: 5, unitPrice: 200 }],
      });

      expect(mockDataSource.transaction).toHaveBeenCalled();
      expect(mockManager.findOne).toHaveBeenCalledTimes(4);
      expect(result.saleID).toBe('new-sale');
    });

    it('should create a sale from Associated Store and deduct from StoreProduct', async () => {
      const mockManager = {
        findOne: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
      };

      mockDataSource.transaction.mockImplementation(async (cb) => {
        mockManager.findOne
          .mockResolvedValueOnce({
            store: { storeID: 'store-assoc' },
            isCentralStore: false,
          })
          .mockResolvedValueOnce({
            variationID: 'var-1',
            stock: 50,
            sku: 'SKU-1',
          })
          .mockResolvedValueOnce({
            store: { storeID: 'store-assoc' },
            variationID: 'var-1',
            stock: 40,
          })
          .mockResolvedValueOnce({
            saleID: 'new-sale-2',
            store: { storeID: 'store-assoc' },
            saleProducts: [],
          });

        mockManager.create.mockImplementation((entity, data) => data);
        mockManager.save.mockImplementation(async (value) => value);

        return cb(mockManager);
      });

      const result = await service.create({
        storeID: 'store-assoc',
        paymentType: 'Credito',
        items: [{ variationID: 'var-1', quantity: 10, unitPrice: 300 }],
      });

      expect(mockDataSource.transaction).toHaveBeenCalled();
      expect(mockManager.findOne).toHaveBeenCalledTimes(4);
      expect(result.saleID).toBe('new-sale-2');
    });
  });
});
