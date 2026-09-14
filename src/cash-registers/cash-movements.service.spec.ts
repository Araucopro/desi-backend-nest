import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TenantContextService } from '../multitenant/tenant-context.service';
import { UserstoresService } from '../relations/userstores/userstores.service';
import { UserRole } from '../users/entities/user.entity';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CashMovementReasonsService } from './cash-movement-reasons.service';
import { CashMovementsService } from './cash-movements.service';
import { CashRegister } from './entities/cash-register.entity';
import {
  CashRegisterSession,
  CashRegisterSessionStatus,
} from './entities/cash-register-session.entity';
import {
  CashMovement,
  CashMovementReasonCode,
  CashMovementReferenceType,
  CashMovementStatus,
  CashMovementType,
} from './entities/cash-movement.entity';

describe('CashMovementsService (Hito 2)', () => {
  let service: CashMovementsService;

  const mockTenantID = 'tenant-uuid-1111';
  const mockStoreID = 'store-uuid-2222';
  const mockUserID = 'user-uuid-3333';
  const mockRegisterID = 'register-uuid-4444';
  const mockSessionID = 'session-uuid-5555';
  const mockMovementID = 'movement-uuid-6666';

  const mockUser: JwtPayload = {
    type: 'tenant',
    userId: mockUserID,
    id: mockUserID,
    tenantId: mockTenantID,
    sessionVersion: 1,
    email: 'cajero@arauco.cl',
    role: UserRole.STORE_MANAGER,
  };

  const mockMovementQueryBuilder: Record<string, jest.Mock> = {};
  for (const method of ['where', 'andWhere', 'orderBy', 'addOrderBy']) {
    mockMovementQueryBuilder[method] = jest
      .fn()
      .mockReturnValue(mockMovementQueryBuilder);
  }
  mockMovementQueryBuilder.getMany = jest.fn();

  const mockMovementRepo: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    createQueryBuilder: jest.Mock;
    manager: { transaction: jest.Mock };
  } = {
    create: jest.fn((values: object) => ({ ...values })),
    save: jest.fn((entity: object) => Promise.resolve(entity)),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(() => mockMovementQueryBuilder),
    manager: {
      transaction: jest.fn((cb: (manager: unknown) => unknown) =>
        cb(mockEntityManager),
      ),
    },
  };

  const mockRegisterRepo: { findOne: jest.Mock } = { findOne: jest.fn() };
  const mockSessionRepo: { findOne: jest.Mock } = { findOne: jest.fn() };

  const mockEntityManager: { getRepository: jest.Mock } = {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === CashRegister) return mockRegisterRepo;
      if (entity === CashRegisterSession) return mockSessionRepo;
      if (entity === CashMovement) return mockMovementRepo;
      return null;
    }),
  };

  const mockUserstoresService = {
    findStoresByUserId: jest
      .fn()
      .mockResolvedValue([{ store: { storeID: mockStoreID } }]),
  };

  const mockCashMovementReasonsService = {
    getActiveByCodeOrFail: jest.fn(),
  };

  const mockTenantContext = {
    getTenantId: jest.fn().mockReturnValue(mockTenantID),
    transaction: jest.fn((cb: (manager: unknown) => unknown) =>
      cb(mockEntityManager),
    ),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRegisterRepo.findOne.mockResolvedValue({
      cashRegisterID: mockRegisterID,
      tenantID: mockTenantID,
      storeID: mockStoreID,
    });
    mockSessionRepo.findOne.mockResolvedValue({
      sessionID: mockSessionID,
      cashRegisterID: mockRegisterID,
      status: CashRegisterSessionStatus.OPEN,
    });
    mockUserstoresService.findStoresByUserId.mockResolvedValue([
      { store: { storeID: mockStoreID } },
    ]);
    mockCashMovementReasonsService.getActiveByCodeOrFail.mockImplementation(
      (
        _manager: unknown,
        _tenantID: string,
        code: string,
        direction: unknown,
      ) =>
        Promise.resolve({
          cashMovementReasonID: 'reason-uuid-7777',
          tenantID: mockTenantID,
          code,
          name: code,
          type: direction,
          requiresApproval: false,
          active: true,
        }),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CashMovementsService,
        {
          provide: getRepositoryToken(CashMovement),
          useValue: mockMovementRepo,
        },
        {
          provide: UserstoresService,
          useValue: mockUserstoresService,
        },
        {
          provide: CashMovementReasonsService,
          useValue: mockCashMovementReasonsService,
        },
        {
          provide: TenantContextService,
          useValue: mockTenantContext,
        },
      ],
    }).compile();

    service = module.get<CashMovementsService>(CashMovementsService);
  });

  describe('createManualMovement', () => {
    it('debe rechazar razones reservadas a módulos satélite (SALE)', async () => {
      await expect(
        service.createManualMovement(
          mockRegisterID,
          mockSessionID,
          {
            type: CashMovementType.CASH_IN,
            amount: 10000,
            reason: CashMovementReasonCode.SALE,
          },
          mockUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe rechazar movimientos cuando la caja no tiene sesión abierta', async () => {
      mockSessionRepo.findOne.mockResolvedValue(null);

      await expect(
        service.createManualMovement(
          mockRegisterID,
          mockSessionID,
          {
            type: CashMovementType.CASH_OUT,
            amount: 10000,
            reason: CashMovementReasonCode.CASH_WITHDRAWAL,
          },
          mockUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe rechazar movimientos si el usuario no pertenece a la tienda', async () => {
      mockUserstoresService.findStoresByUserId.mockResolvedValue([
        { store: { storeID: 'otra-tienda' } },
      ]);

      await expect(
        service.createManualMovement(
          mockRegisterID,
          mockSessionID,
          {
            type: CashMovementType.CASH_OUT,
            amount: 10000,
            reason: CashMovementReasonCode.CASH_WITHDRAWAL,
          },
          mockUser,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('debe registrar el movimiento manual como POSTED con referencia MANUAL', async () => {
      const result = await service.createManualMovement(
        mockRegisterID,
        mockSessionID,
        {
          type: CashMovementType.CASH_OUT,
          amount: 30000,
          reason: CashMovementReasonCode.CASH_WITHDRAWAL,
          description: 'Retiro a bóveda',
        },
        mockUser,
      );

      expect(result).toMatchObject({
        tenantID: mockTenantID,
        sessionID: mockSessionID,
        type: CashMovementType.CASH_OUT,
        amount: 30000,
        status: CashMovementStatus.POSTED,
        reason: CashMovementReasonCode.CASH_WITHDRAWAL,
        referenceType: CashMovementReferenceType.MANUAL,
        referenceID: null,
        description: 'Retiro a bóveda',
        createdByUserID: mockUserID,
      });
      expect(result.occurredAt).toBeInstanceOf(Date);
    });

    it('debe rechazar razones que no existen o no están activas en el catálogo (Hito 3)', async () => {
      mockCashMovementReasonsService.getActiveByCodeOrFail.mockRejectedValue(
        new BadRequestException(
          'La razón "CUSTOM_REASON" no existe o no está activa en el catálogo de razones de caja',
        ),
      );

      await expect(
        service.createManualMovement(
          mockRegisterID,
          mockSessionID,
          {
            type: CashMovementType.CASH_OUT,
            amount: 10000,
            reason: 'CUSTOM_REASON',
          },
          mockUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe exigir supervisor cuando la razón requiere aprobación (Hito 3)', async () => {
      mockCashMovementReasonsService.getActiveByCodeOrFail.mockResolvedValue({
        cashMovementReasonID: 'reason-uuid-8888',
        tenantID: mockTenantID,
        code: CashMovementReasonCode.CASH_ADJUSTMENT,
        name: 'Ajuste de caja',
        type: null,
        requiresApproval: true,
        active: true,
      });
      const consignadoUser: JwtPayload = {
        ...mockUser,
        role: UserRole.CONSIGNADO,
      };

      await expect(
        service.createManualMovement(
          mockRegisterID,
          mockSessionID,
          {
            type: CashMovementType.CASH_IN,
            amount: 5000,
            reason: CashMovementReasonCode.CASH_ADJUSTMENT,
          },
          consignadoUser,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('debe permitir al supervisor registrar una razón con requiresApproval (Hito 3)', async () => {
      mockCashMovementReasonsService.getActiveByCodeOrFail.mockResolvedValue({
        cashMovementReasonID: 'reason-uuid-8888',
        tenantID: mockTenantID,
        code: CashMovementReasonCode.CASH_ADJUSTMENT,
        name: 'Ajuste de caja',
        type: null,
        requiresApproval: true,
        active: true,
      });

      const result = await service.createManualMovement(
        mockRegisterID,
        mockSessionID,
        {
          type: CashMovementType.CASH_IN,
          amount: 5000,
          reason: CashMovementReasonCode.CASH_ADJUSTMENT,
        },
        mockUser,
      );

      expect(result).toMatchObject({
        reason: CashMovementReasonCode.CASH_ADJUSTMENT,
        type: CashMovementType.CASH_IN,
        amount: 5000,
        referenceType: CashMovementReferenceType.MANUAL,
      });
      expect(
        mockCashMovementReasonsService.getActiveByCodeOrFail,
      ).toHaveBeenCalledWith(
        mockEntityManager,
        mockTenantID,
        CashMovementReasonCode.CASH_ADJUSTMENT,
        CashMovementType.CASH_IN,
      );
    });
  });

  describe('voidMovement', () => {
    const voidDto = { reason: 'Monto digitado erróneamente' };

    it('debe lanzar NotFoundException si el movimiento no existe en la sesión', async () => {
      mockMovementRepo.findOne.mockResolvedValue(null);

      await expect(
        service.voidMovement(
          mockRegisterID,
          mockSessionID,
          mockMovementID,
          voidDto,
          mockUser,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('debe lanzar ConflictException si el movimiento ya está anulado', async () => {
      mockMovementRepo.findOne.mockResolvedValue({
        cashMovementID: mockMovementID,
        sessionID: mockSessionID,
        type: CashMovementType.CASH_OUT,
        amount: 30000,
        status: CashMovementStatus.VOIDED,
      });

      await expect(
        service.voidMovement(
          mockRegisterID,
          mockSessionID,
          mockMovementID,
          voidDto,
          mockUser,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('debe anular el movimiento y generar el contra-movimiento de compensación', async () => {
      const movement = {
        cashMovementID: mockMovementID,
        tenantID: mockTenantID,
        sessionID: mockSessionID,
        type: CashMovementType.CASH_OUT,
        amount: 30000,
        status: CashMovementStatus.POSTED,
        reason: CashMovementReasonCode.CASH_WITHDRAWAL,
      };
      mockMovementRepo.findOne.mockResolvedValue(movement);

      const result = await service.voidMovement(
        mockRegisterID,
        mockSessionID,
        mockMovementID,
        voidDto,
        mockUser,
      );

      expect(result.movement.status).toBe(CashMovementStatus.VOIDED);
      expect(result.movement.voidedByUserID).toBe(mockUserID);
      expect(result.movement.voidReason).toBe(voidDto.reason);
      expect(result.reversal).toMatchObject({
        sessionID: mockSessionID,
        type: CashMovementType.CASH_IN,
        amount: 30000,
        status: CashMovementStatus.POSTED,
        referenceType: CashMovementReferenceType.CASH_MOVEMENT,
        referenceID: mockMovementID,
        createdByUserID: mockUserID,
      });
    });
  });

  describe('listSessionMovements', () => {
    it('debe listar los movimientos de la sesión aplicando filtros', async () => {
      const movements = [{ cashMovementID: mockMovementID }];
      mockMovementQueryBuilder.getMany.mockResolvedValue(movements);

      const result = await service.listSessionMovements(
        mockRegisterID,
        mockSessionID,
        {
          type: CashMovementType.CASH_OUT,
          status: CashMovementStatus.POSTED,
          referenceType: CashMovementReferenceType.MANUAL,
        },
      );

      expect(result).toEqual(movements);
      expect(mockMovementQueryBuilder.where).toHaveBeenCalledWith(
        'movement.tenantID = :tenantID',
        { tenantID: mockTenantID },
      );
      expect(mockMovementQueryBuilder.andWhere).toHaveBeenCalledWith(
        'movement.type = :type',
        { type: CashMovementType.CASH_OUT },
      );
      expect(mockMovementQueryBuilder.andWhere).toHaveBeenCalledWith(
        'movement.referenceType = :referenceType',
        { referenceType: CashMovementReferenceType.MANUAL },
      );
    });
  });
});
