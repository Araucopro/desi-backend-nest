import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TenantContextService } from '../multitenant/tenant-context.service';
import { CashMovementReasonsService } from './cash-movement-reasons.service';
import { CashMovementType } from './entities/cash-movement.entity';
import {
  CashMovementReason,
  DEFAULT_CASH_MOVEMENT_REASONS,
} from './entities/cash-movement-reason.entity';

describe('CashMovementReasonsService (Hito 3)', () => {
  let service: CashMovementReasonsService;

  const mockTenantID = 'tenant-uuid-1111';
  const mockReasonID = 'reason-uuid-2222';

  const mockReasonQueryBuilder: Record<string, jest.Mock> = {};
  for (const method of ['where', 'andWhere', 'orderBy']) {
    mockReasonQueryBuilder[method] = jest
      .fn()
      .mockReturnValue(mockReasonQueryBuilder);
  }
  mockReasonQueryBuilder.getMany = jest.fn();

  const mockReasonRepo: {
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
    findOne: jest.Mock;
    createQueryBuilder: jest.Mock;
    manager: { transaction: jest.Mock };
  } = {
    create: jest.fn((values: object) => ({ ...values })),
    save: jest.fn((entity: unknown) => Promise.resolve(entity)),
    find: jest.fn(),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(() => mockReasonQueryBuilder),
    manager: {
      transaction: jest.fn((cb: (manager: unknown) => unknown) =>
        cb(mockEntityManager),
      ),
    },
  };

  const mockEntityManager: { getRepository: jest.Mock } = {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === CashMovementReason) return mockReasonRepo;
      return null;
    }),
  };

  const mockTenantContext = {
    getTenantId: jest.fn().mockReturnValue(mockTenantID),
    transaction: jest.fn((cb: (manager: unknown) => unknown) =>
      cb(mockEntityManager),
    ),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CashMovementReasonsService,
        {
          provide: getRepositoryToken(CashMovementReason),
          useValue: mockReasonRepo,
        },
        {
          provide: TenantContextService,
          useValue: mockTenantContext,
        },
      ],
    }).compile();

    service = module.get<CashMovementReasonsService>(
      CashMovementReasonsService,
    );
  });

  describe('create', () => {
    it('debe normalizar el código y aplicar los valores por defecto', async () => {
      mockReasonRepo.findOne.mockResolvedValue(null);

      const result = await service.create({
        code: ' cash withdrawal ',
        name: ' Retiro de efectivo ',
        type: CashMovementType.CASH_OUT,
      });

      expect(result).toMatchObject({
        tenantID: mockTenantID,
        code: 'CASH_WITHDRAWAL',
        name: 'Retiro de efectivo',
        type: CashMovementType.CASH_OUT,
        requiresApproval: false,
        active: true,
      });
    });

    it('debe lanzar ConflictException si el código ya existe', async () => {
      mockReasonRepo.findOne.mockResolvedValue({
        cashMovementReasonID: 'otra',
      });

      await expect(
        service.create({ code: 'CASH_WITHDRAWAL', name: 'Retiro' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('getActiveByCodeOrFail', () => {
    it('debe lanzar BadRequestException si la razón no existe o está inactiva', async () => {
      mockReasonRepo.findOne.mockResolvedValue(null);

      await expect(
        service.getActiveByCodeOrFail(
          mockEntityManager as never,
          mockTenantID,
          'CASH_WITHDRAWAL',
          CashMovementType.CASH_OUT,
        ),
      ).rejects.toThrow(BadRequestException);

      mockReasonRepo.findOne.mockResolvedValue({
        code: 'CASH_WITHDRAWAL',
        active: false,
      });

      await expect(
        service.getActiveByCodeOrFail(
          mockEntityManager as never,
          mockTenantID,
          'CASH_WITHDRAWAL',
          CashMovementType.CASH_OUT,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe lanzar BadRequestException si la razón no admite el sentido del movimiento', async () => {
      mockReasonRepo.findOne.mockResolvedValue({
        code: 'CASH_WITHDRAWAL',
        name: 'Retiro de efectivo',
        type: CashMovementType.CASH_OUT,
        active: true,
      });

      await expect(
        service.getActiveByCodeOrFail(
          mockEntityManager as never,
          mockTenantID,
          'CASH_WITHDRAWAL',
          CashMovementType.CASH_IN,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe permitir razones sin sentido asignado en ambos sentidos', async () => {
      const adjustment = {
        code: 'CASH_ADJUSTMENT',
        name: 'Ajuste de caja',
        type: null,
        requiresApproval: true,
        active: true,
      };
      mockReasonRepo.findOne.mockResolvedValue(adjustment);

      await expect(
        service.getActiveByCodeOrFail(
          mockEntityManager as never,
          mockTenantID,
          'cash_adjustment',
          CashMovementType.CASH_IN,
        ),
      ).resolves.toBe(adjustment);
    });
  });

  describe('findAll', () => {
    it('debe filtrar por sentido incluyendo las razones que aplican a ambos', async () => {
      mockReasonQueryBuilder.getMany.mockResolvedValue([]);

      await service.findAll({
        active: true,
        type: CashMovementType.CASH_IN,
        requiresApproval: false,
      });

      expect(mockReasonQueryBuilder.andWhere).toHaveBeenCalledWith(
        'reason.active = :active',
        { active: true },
      );
      expect(mockReasonQueryBuilder.andWhere).toHaveBeenCalledWith(
        'reason.requiresApproval = :requiresApproval',
        { requiresApproval: false },
      );
      expect(mockReasonQueryBuilder.andWhere).toHaveBeenCalledWith(
        '(reason.type = :type OR reason.type IS NULL)',
        { type: CashMovementType.CASH_IN },
      );
    });
  });

  describe('findOne', () => {
    it('debe lanzar NotFoundException si la razón no existe en el tenant', async () => {
      mockReasonRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne(mockReasonID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('debe lanzar NotFoundException si la razón no existe', async () => {
      mockReasonRepo.findOne.mockResolvedValue(null);

      await expect(
        service.update(mockReasonID, { active: false }),
      ).rejects.toThrow(NotFoundException);
    });

    it('debe permitir quitar el sentido asignado (aplica a ambos)', async () => {
      const reason = {
        cashMovementReasonID: mockReasonID,
        tenantID: mockTenantID,
        code: 'CASH_WITHDRAWAL',
        name: 'Retiro de efectivo',
        type: CashMovementType.CASH_OUT,
        requiresApproval: false,
        active: true,
      };
      mockReasonRepo.findOne.mockResolvedValue(reason);

      const result = await service.update(mockReasonID, {
        name: 'Retiro a bóveda',
        type: null,
        requiresApproval: true,
      });

      expect(result).toMatchObject({
        name: 'Retiro a bóveda',
        type: null,
        requiresApproval: true,
      });
    });
  });

  describe('seedDefaults', () => {
    it('debe crear solo los códigos faltantes de forma idempotente', async () => {
      mockReasonRepo.find
        .mockResolvedValueOnce([{ code: 'SALE' }])
        .mockResolvedValueOnce([]);

      await service.seedDefaults();

      const savedBatch = mockReasonRepo.save.mock.calls[0][0] as {
        code: string;
      }[];
      expect(savedBatch).toHaveLength(DEFAULT_CASH_MOVEMENT_REASONS.length - 1);
      expect(savedBatch.map((item) => item.code)).not.toContain('SALE');
      expect(savedBatch.map((item) => item.code)).toContain('CASH_ADJUSTMENT');
      expect(
        savedBatch.find((item) => item.code === 'CASH_ADJUSTMENT'),
      ).toMatchObject({ requiresApproval: true, type: null });
    });
  });
});
