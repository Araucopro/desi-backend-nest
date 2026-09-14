import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { TenantContextService } from '../multitenant/tenant-context.service';
import { CashDenominationsService } from './cash-denominations.service';
import {
  CashDenomination,
  CashDenominationType,
} from './entities/cash-denomination.entity';

describe('CashDenominationsService (Hito 4)', () => {
  let service: CashDenominationsService;

  const mockTenantID = 'tenant-uuid-1111';
  const mockDenominationID = 'denomination-uuid-20000';

  const buildDenomination = (overrides: Record<string, unknown> = {}) => ({
    cashDenominationID: mockDenominationID,
    tenantID: mockTenantID,
    value: 20000,
    type: CashDenominationType.BANKNOTE,
    label: '$20.000',
    sortOrder: 90,
    active: true,
    ...overrides,
  });

  const mockDenominationRepo: {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    createQueryBuilder: jest.Mock;
    manager: { transaction: jest.Mock };
  } = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((values: object) => ({ ...values })),
    save: jest.fn((entity: unknown) => Promise.resolve(entity)),
    createQueryBuilder: jest.fn(),
    manager: { transaction: jest.fn() },
  };

  const mockEntityManager: { getRepository: jest.Mock } = {
    getRepository: jest.fn((entity: unknown) =>
      entity === CashDenomination ? mockDenominationRepo : null,
    ),
  };
  mockDenominationRepo.manager.transaction = jest.fn(
    (callback: (manager: unknown) => unknown) => callback(mockEntityManager),
  );

  const mockTenantContext = {
    getTenantId: jest.fn().mockReturnValue(mockTenantID),
    transaction: jest.fn((callback: (manager: unknown) => unknown) =>
      callback(mockEntityManager),
    ),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockDenominationRepo.findOne.mockResolvedValue(null);
    mockDenominationRepo.find.mockResolvedValue([]);
    mockDenominationRepo.save.mockImplementation((entity: unknown) =>
      Promise.resolve(entity),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CashDenominationsService,
        {
          provide: getRepositoryToken(CashDenomination),
          useValue: mockDenominationRepo,
        },
        {
          provide: TenantContextService,
          useValue: mockTenantContext,
        },
      ],
    }).compile();

    service = module.get<CashDenominationsService>(CashDenominationsService);
  });

  describe('create', () => {
    it('debe crear la denominación con etiqueta formateada cuando no se envía', async () => {
      const result = await service.create({
        value: 20000,
        type: CashDenominationType.BANKNOTE,
      });

      expect(result).toMatchObject({
        tenantID: mockTenantID,
        value: 20000,
        type: CashDenominationType.BANKNOTE,
        label: '$20.000',
        active: true,
      });
    });

    it('debe lanzar ConflictException si la denominación ya existe', async () => {
      mockDenominationRepo.findOne.mockResolvedValue(buildDenomination());

      await expect(
        service.create({
          value: 20000,
          type: CashDenominationType.BANKNOTE,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    it('debe permitir solo cambiar etiqueta, orden y vigencia', async () => {
      mockDenominationRepo.findOne.mockResolvedValue(buildDenomination());

      const result = await service.update(mockDenominationID, {
        label: 'Billete 20 lucas',
        sortOrder: 95,
        active: false,
      });

      expect(result).toMatchObject({
        label: 'Billete 20 lucas',
        sortOrder: 95,
        active: false,
        value: 20000,
        type: CashDenominationType.BANKNOTE,
      });
    });

    it('debe lanzar NotFoundException si la denominación no existe', async () => {
      mockDenominationRepo.findOne.mockResolvedValue(null);

      await expect(
        service.update(mockDenominationID, { active: false }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('seedDefaults', () => {
    it('debe crear solo las denominaciones CLP faltantes', async () => {
      mockDenominationRepo.find.mockResolvedValue([
        buildDenomination(),
        buildDenomination({
          cashDenominationID: 'denomination-uuid-10000',
          value: 10000,
          label: '$10.000',
        }),
      ]);

      await service.seedDefaults();

      const savedItems = mockDenominationRepo.save.mock.calls[0][0] as Array<{
        value: number;
      }>;
      const savedValues = savedItems.map((item) => item.value);

      expect(savedValues).not.toContain(20000);
      expect(savedValues).not.toContain(10000);
      expect(savedValues).toContain(5000);
      expect(savedItems).toHaveLength(7);
    });

    it('no debe escribir si el catálogo ya está completo', async () => {
      mockDenominationRepo.find.mockResolvedValue([
        buildDenomination(),
        buildDenomination({ cashDenominationID: 'd-10000', value: 10000 }),
        buildDenomination({ cashDenominationID: 'd-5000', value: 5000 }),
        buildDenomination({ cashDenominationID: 'd-2000', value: 2000 }),
        buildDenomination({ cashDenominationID: 'd-1000', value: 1000 }),
        buildDenomination({
          cashDenominationID: 'd-500',
          value: 500,
          type: CashDenominationType.COIN,
        }),
        buildDenomination({
          cashDenominationID: 'd-100',
          value: 100,
          type: CashDenominationType.COIN,
        }),
        buildDenomination({
          cashDenominationID: 'd-50',
          value: 50,
          type: CashDenominationType.COIN,
        }),
        buildDenomination({
          cashDenominationID: 'd-10',
          value: 10,
          type: CashDenominationType.COIN,
        }),
      ]);

      await service.seedDefaults();

      expect(mockDenominationRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('resolveUsableByIds', () => {
    it('debe devolver las denominaciones vigentes indexadas por ID', async () => {
      mockDenominationRepo.find.mockResolvedValue([buildDenomination()]);

      const result = await service.resolveUsableByIds(
        mockEntityManager as unknown as EntityManager,
        mockTenantID,
        [mockDenominationID],
      );

      expect(result.get(mockDenominationID)).toMatchObject({
        value: 20000,
      });
    });

    it('debe lanzar NotFoundException si la denominación no existe', async () => {
      mockDenominationRepo.find.mockResolvedValue([]);

      await expect(
        service.resolveUsableByIds(
          mockEntityManager as unknown as EntityManager,
          mockTenantID,
          [mockDenominationID],
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('debe lanzar BadRequestException si la denominación está inactiva', async () => {
      mockDenominationRepo.find.mockResolvedValue([
        buildDenomination({ active: false }),
      ]);

      await expect(
        service.resolveUsableByIds(
          mockEntityManager as unknown as EntityManager,
          mockTenantID,
          [mockDenominationID],
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
