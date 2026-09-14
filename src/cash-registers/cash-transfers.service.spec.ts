import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { TenantContextService } from '../multitenant/tenant-context.service';
import { UserstoresService } from '../relations/userstores/userstores.service';
import { UserRole } from '../users/entities/user.entity';
import { CashTransfersService } from './cash-transfers.service';
import { CashMovementsService } from './cash-movements.service';
import {
  CashMovementReasonCode,
  CashMovementReferenceType,
  CashMovementType,
} from './entities/cash-movement.entity';
import { CashMovement } from './entities/cash-movement.entity';
import {
  CashRegister,
  CashRegisterStatus,
} from './entities/cash-register.entity';
import {
  CashRegisterSession,
  CashRegisterSessionStatus,
} from './entities/cash-register-session.entity';
import {
  CashTransfer,
  CashTransferDestinationType,
  CashTransferStatus,
} from './entities/cash-transfer.entity';
import {
  CashTransferDirection,
  QueryCashTransfersDto,
} from './dto/query-cash-transfers.dto';

describe('CashTransfersService (Hito 5)', () => {
  let service: CashTransfersService;

  const mockTenantID = 'tenant-uuid-1111';
  const mockStoreID = 'store-uuid-2222';
  const mockUserID = 'user-uuid-3333';
  const mockRegisterID = 'register-uuid-4444';
  const mockSessionID = 'session-uuid-5555';
  const mockTransferID = 'transfer-uuid-6666';
  const mockDestinationRegisterID = 'register-uuid-7777';
  const mockDestinationSessionID = 'session-uuid-8888';

  const mockOperatorUser: JwtPayload = {
    type: 'tenant',
    userId: mockUserID,
    id: mockUserID,
    tenantId: mockTenantID,
    sessionVersion: 1,
    email: 'cajero@arauco.cl',
    role: UserRole.CONSIGNADO,
  };

  const mockSupervisorUser: JwtPayload = {
    ...mockOperatorUser,
    userId: 'user-uuid-9999',
    id: 'user-uuid-9999',
    email: 'supervisor@arauco.cl',
    role: UserRole.STORE_MANAGER,
  };

  const buildRegister = (overrides: Record<string, unknown> = {}) => ({
    cashRegisterID: mockRegisterID,
    tenantID: mockTenantID,
    storeID: mockStoreID,
    code: 'CAJA-01',
    name: 'Caja principal',
    status: CashRegisterStatus.ACTIVE,
    ...overrides,
  });

  const buildSession = (overrides: Record<string, unknown> = {}) => ({
    sessionID: mockSessionID,
    tenantID: mockTenantID,
    cashRegisterID: mockRegisterID,
    businessDate: '2026-09-14',
    openingBalance: 100000,
    status: CashRegisterSessionStatus.OPEN,
    ...overrides,
  });

  const buildTransfer = (overrides: Record<string, unknown> = {}) => ({
    cashTransferID: mockTransferID,
    tenantID: mockTenantID,
    storeID: mockStoreID,
    sourceCashRegisterID: mockRegisterID,
    sourceSessionID: mockSessionID,
    destinationType: CashTransferDestinationType.VAULT,
    destinationCashRegisterID: null,
    destinationSessionID: null,
    destinationLabel: 'Bóveda central',
    amount: 25000,
    status: CashTransferStatus.PENDING,
    requestedByUserID: mockUserID,
    requestedAt: new Date(Date.now() - 3600_000),
    sourceMovementID: null,
    destinationMovementID: null,
    notes: null,
    ...overrides,
  });

  const mockRegisterRepo: { findOne: jest.Mock } = { findOne: jest.fn() };
  const mockSessionRepo: { findOne: jest.Mock } = { findOne: jest.fn() };

  const mockMovementQueryBuilder: Record<string, jest.Mock> = {};
  for (const method of [
    'select',
    'addSelect',
    'where',
    'andWhere',
    'setParameters',
    'groupBy',
    'addGroupBy',
    'orderBy',
    'addOrderBy',
  ]) {
    mockMovementQueryBuilder[method] = jest
      .fn()
      .mockReturnValue(mockMovementQueryBuilder);
  }
  mockMovementQueryBuilder.getRawOne = jest.fn();

  const mockMovementRepo: { createQueryBuilder: jest.Mock } = {
    createQueryBuilder: jest.fn(() => mockMovementQueryBuilder),
  };

  const mockTransferQueryBuilder: Record<string, jest.Mock> = {};
  for (const method of ['where', 'andWhere', 'orderBy', 'addOrderBy']) {
    mockTransferQueryBuilder[method] = jest
      .fn()
      .mockReturnValue(mockTransferQueryBuilder);
  }
  mockTransferQueryBuilder.getMany = jest.fn();

  const mockTransferRepo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    createQueryBuilder: jest.Mock;
    manager: { transaction: jest.Mock };
  } = {
    findOne: jest.fn(),
    create: jest.fn((values: object) => ({ ...values })),
    save: jest.fn((entity: unknown) => Promise.resolve(entity)),
    createQueryBuilder: jest.fn(() => mockTransferQueryBuilder),
    manager: { transaction: jest.fn() },
  };

  const mockEntityManager: { getRepository: jest.Mock } = {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === CashRegister) return mockRegisterRepo;
      if (entity === CashRegisterSession) return mockSessionRepo;
      if (entity === CashMovement) return mockMovementRepo;
      if (entity === CashTransfer) return mockTransferRepo;
      return null;
    }),
  };

  mockTransferRepo.manager.transaction = jest.fn(
    (callback: (manager: unknown) => unknown) => callback(mockEntityManager),
  );

  const mockUserstoresService = {
    findStoresByUserId: jest
      .fn()
      .mockResolvedValue([{ store: { storeID: mockStoreID } }]),
  };

  const mockTenantContext = {
    getTenantId: jest.fn().mockReturnValue(mockTenantID),
    transaction: jest.fn((callback: (manager: unknown) => unknown) =>
      callback(mockEntityManager),
    ),
  };

  const mockCashMovementsService = {
    recordSystemMovement: jest.fn(
      (_manager: unknown, input: { type: CashMovementType }) =>
        Promise.resolve({
          cashMovementID: `movement-${input.type}`,
          ...input,
        }),
    ),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Limpia colas de `mockResolvedValueOnce` que hayan quedado sin consumir.
    mockRegisterRepo.findOne.mockReset();
    mockSessionRepo.findOne.mockReset();
    mockTransferRepo.findOne.mockReset();
    mockTransferRepo.create.mockReset();
    mockTransferRepo.create.mockImplementation((values: object) => ({
      ...values,
    }));
    mockTransferRepo.save.mockReset();

    mockRegisterRepo.findOne.mockResolvedValue(buildRegister());
    mockSessionRepo.findOne.mockResolvedValue(buildSession());
    mockUserstoresService.findStoresByUserId.mockResolvedValue([
      { store: { storeID: mockStoreID } },
    ]);
    mockTransferRepo.findOne.mockResolvedValue(buildTransfer());
    mockTransferRepo.save.mockImplementation((entity: unknown) =>
      Promise.resolve(entity),
    );
    mockTransferQueryBuilder.getMany.mockResolvedValue([]);
    // Fondo 100.000 + movimientos netos 50.000 = 150.000 esperado en efectivo.
    mockMovementQueryBuilder.getRawOne.mockResolvedValue({
      net: '50000',
      cashIn: '50000',
      cashOut: '0',
      movementCount: '3',
    });
    mockCashMovementsService.recordSystemMovement.mockImplementation(
      (_manager: unknown, input: { type: CashMovementType }) =>
        Promise.resolve({
          cashMovementID: `movement-${input.type}`,
          ...input,
        }),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CashTransfersService,
        {
          provide: getRepositoryToken(CashTransfer),
          useValue: mockTransferRepo,
        },
        {
          provide: UserstoresService,
          useValue: mockUserstoresService,
        },
        {
          provide: CashMovementsService,
          useValue: mockCashMovementsService,
        },
        {
          provide: TenantContextService,
          useValue: mockTenantContext,
        },
      ],
    }).compile();

    service = module.get<CashTransfersService>(CashTransfersService);
  });

  describe('create', () => {
    it('debe solicitar una transferencia PENDING hacia bóveda sin mover efectivo', async () => {
      const result = await service.create(
        mockRegisterID,
        mockSessionID,
        {
          destinationType: CashTransferDestinationType.VAULT,
          destinationLabel: 'Bóveda central',
          amount: 25000,
          notes: 'Excedente del turno',
        },
        mockOperatorUser,
      );

      expect(result).toMatchObject({
        tenantID: mockTenantID,
        storeID: mockStoreID,
        sourceCashRegisterID: mockRegisterID,
        sourceSessionID: mockSessionID,
        destinationType: CashTransferDestinationType.VAULT,
        destinationCashRegisterID: null,
        destinationSessionID: null,
        destinationLabel: 'Bóveda central',
        amount: 25000,
        status: CashTransferStatus.PENDING,
        requestedByUserID: mockUserID,
        notes: 'Excedente del turno',
      });
      expect(
        mockCashMovementsService.recordSystemMovement,
      ).not.toHaveBeenCalled();
    });

    it('debe exigir la caja destino cuando el destino es otra caja', async () => {
      await expect(
        service.create(
          mockRegisterID,
          mockSessionID,
          {
            destinationType: CashTransferDestinationType.CASH_REGISTER,
            amount: 25000,
          },
          mockOperatorUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe rechazar una transferencia hacia la misma caja de origen', async () => {
      await expect(
        service.create(
          mockRegisterID,
          mockSessionID,
          {
            destinationType: CashTransferDestinationType.CASH_REGISTER,
            destinationCashRegisterID: mockRegisterID,
            amount: 25000,
          },
          mockOperatorUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe rechazar cajas destino inactivas', async () => {
      mockRegisterRepo.findOne
        .mockResolvedValueOnce(buildRegister())
        .mockResolvedValueOnce(
          buildRegister({
            cashRegisterID: mockDestinationRegisterID,
            status: CashRegisterStatus.MAINTENANCE,
          }),
        );

      await expect(
        service.create(
          mockRegisterID,
          mockSessionID,
          {
            destinationType: CashTransferDestinationType.CASH_REGISTER,
            destinationCashRegisterID: mockDestinationRegisterID,
            amount: 25000,
          },
          mockOperatorUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('approve', () => {
    it('debe exigir facultad de supervisión para aprobar', async () => {
      await expect(
        service.approve(
          mockRegisterID,
          mockSessionID,
          mockTransferID,
          {},
          mockOperatorUser,
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(mockTransferRepo.save).not.toHaveBeenCalled();
    });

    it('debe aprobar la transferencia dejándola lista para ejecutar', async () => {
      const result = await service.approve(
        mockRegisterID,
        mockSessionID,
        mockTransferID,
        { notes: 'Autorizado por supervisión' },
        mockSupervisorUser,
      );

      expect(result).toMatchObject({
        status: CashTransferStatus.APPROVED,
        approvedByUserID: mockSupervisorUser.userId,
        approvalNotes: 'Autorizado por supervisión',
      });
      expect(result.approvedAt).toBeInstanceOf(Date);
      expect(
        mockCashMovementsService.recordSystemMovement,
      ).not.toHaveBeenCalled();
    });

    it('debe rechazar la aprobación de una transferencia ya completada', async () => {
      mockTransferRepo.findOne.mockResolvedValue(
        buildTransfer({ status: CashTransferStatus.COMPLETED }),
      );

      await expect(
        service.approve(
          mockRegisterID,
          mockSessionID,
          mockTransferID,
          {},
          mockSupervisorUser,
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('complete', () => {
    it('debe completar una transferencia aprobada hacia bóveda con CASH_OUT', async () => {
      mockTransferRepo.findOne.mockResolvedValue(
        buildTransfer({ status: CashTransferStatus.APPROVED }),
      );

      const result = await service.complete(
        mockRegisterID,
        mockSessionID,
        mockTransferID,
        {},
        mockOperatorUser,
      );

      expect(result).toMatchObject({
        status: CashTransferStatus.COMPLETED,
        sourceMovementID: `movement-${CashMovementType.CASH_OUT}`,
        destinationSessionID: null,
        destinationMovementID: null,
        completedByUserID: mockUserID,
      });
      expect(result.completedAt).toBeInstanceOf(Date);
      expect(result.occurredAt).toBeInstanceOf(Date);

      expect(
        mockCashMovementsService.recordSystemMovement,
      ).toHaveBeenCalledTimes(1);
      expect(
        mockCashMovementsService.recordSystemMovement,
      ).toHaveBeenCalledWith(
        mockEntityManager,
        expect.objectContaining({
          tenantID: mockTenantID,
          sessionID: mockSessionID,
          type: CashMovementType.CASH_OUT,
          amount: 25000,
          reason: CashMovementReasonCode.CASH_TRANSFER,
          referenceType: CashMovementReferenceType.CASH_TRANSFER,
          referenceID: mockTransferID,
          createdByUserID: mockUserID,
        }),
      );
    });

    it('debe completar una transferencia hacia otra caja generando CASH_OUT y CASH_IN', async () => {
      mockRegisterRepo.findOne
        .mockResolvedValueOnce(buildRegister())
        .mockResolvedValueOnce(
          buildRegister({ cashRegisterID: mockDestinationRegisterID }),
        );
      mockSessionRepo.findOne
        .mockResolvedValueOnce(buildSession())
        .mockResolvedValueOnce(
          buildSession({
            sessionID: mockDestinationSessionID,
            cashRegisterID: mockDestinationRegisterID,
          }),
        );
      mockTransferRepo.findOne.mockResolvedValue(
        buildTransfer({
          status: CashTransferStatus.APPROVED,
          destinationType: CashTransferDestinationType.CASH_REGISTER,
          destinationCashRegisterID: mockDestinationRegisterID,
          destinationLabel: null,
        }),
      );

      const result = await service.complete(
        mockRegisterID,
        mockSessionID,
        mockTransferID,
        {},
        mockOperatorUser,
      );

      expect(result).toMatchObject({
        status: CashTransferStatus.COMPLETED,
        destinationSessionID: mockDestinationSessionID,
        sourceMovementID: `movement-${CashMovementType.CASH_OUT}`,
        destinationMovementID: `movement-${CashMovementType.CASH_IN}`,
      });
      expect(
        mockCashMovementsService.recordSystemMovement,
      ).toHaveBeenCalledTimes(2);
      expect(
        mockCashMovementsService.recordSystemMovement,
      ).toHaveBeenLastCalledWith(
        mockEntityManager,
        expect.objectContaining({
          sessionID: mockDestinationSessionID,
          type: CashMovementType.CASH_IN,
          referenceID: mockTransferID,
        }),
      );
    });

    it('debe exigir facultad de supervisión para completar una transferencia PENDING', async () => {
      await expect(
        service.complete(
          mockRegisterID,
          mockSessionID,
          mockTransferID,
          {},
          mockOperatorUser,
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(
        mockCashMovementsService.recordSystemMovement,
      ).not.toHaveBeenCalled();
    });

    it('debe permitir al supervisor completar una transferencia PENDING aprobándola en el acto', async () => {
      const result = await service.complete(
        mockRegisterID,
        mockSessionID,
        mockTransferID,
        {},
        mockSupervisorUser,
      );

      expect(result).toMatchObject({
        status: CashTransferStatus.COMPLETED,
        approvedByUserID: mockSupervisorUser.userId,
      });
    });

    it('debe rechazar el traslado cuando el monto supera el efectivo esperado', async () => {
      mockTransferRepo.findOne.mockResolvedValue(
        buildTransfer({ status: CashTransferStatus.APPROVED, amount: 200000 }),
      );

      await expect(
        service.complete(
          mockRegisterID,
          mockSessionID,
          mockTransferID,
          {},
          mockOperatorUser,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(
        mockCashMovementsService.recordSystemMovement,
      ).not.toHaveBeenCalled();
    });

    it('debe rechazar el traslado si la caja destino no tiene sesión abierta', async () => {
      mockRegisterRepo.findOne
        .mockResolvedValueOnce(buildRegister())
        .mockResolvedValueOnce(
          buildRegister({ cashRegisterID: mockDestinationRegisterID }),
        );
      mockSessionRepo.findOne
        .mockResolvedValueOnce(buildSession())
        .mockResolvedValueOnce(null);
      mockTransferRepo.findOne.mockResolvedValue(
        buildTransfer({
          status: CashTransferStatus.APPROVED,
          destinationType: CashTransferDestinationType.CASH_REGISTER,
          destinationCashRegisterID: mockDestinationRegisterID,
        }),
      );

      await expect(
        service.complete(
          mockRegisterID,
          mockSessionID,
          mockTransferID,
          {},
          mockOperatorUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe rechazar un occurredAt anterior a la solicitud', async () => {
      const requestedAt = new Date(Date.now() - 60_000);
      mockTransferRepo.findOne.mockResolvedValue(
        buildTransfer({ status: CashTransferStatus.APPROVED, requestedAt }),
      );

      await expect(
        service.complete(
          mockRegisterID,
          mockSessionID,
          mockTransferID,
          {
            occurredAt: new Date(requestedAt.getTime() - 60_000).toISOString(),
          },
          mockOperatorUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('reject y cancel', () => {
    it('debe rechazar la transferencia con su motivo quedando sin mover efectivo', async () => {
      const result = await service.reject(
        mockRegisterID,
        mockSessionID,
        mockTransferID,
        { reason: 'El monto no coincide con el conteo' },
        mockSupervisorUser,
      );

      expect(result).toMatchObject({
        status: CashTransferStatus.REJECTED,
        rejectedByUserID: mockSupervisorUser.userId,
        rejectionReason: 'El monto no coincide con el conteo',
      });
      expect(result.rejectedAt).toBeInstanceOf(Date);
      expect(
        mockCashMovementsService.recordSystemMovement,
      ).not.toHaveBeenCalled();
    });

    it('debe permitir al solicitante cancelar una transferencia PENDING', async () => {
      const result = await service.cancel(
        mockRegisterID,
        mockSessionID,
        mockTransferID,
        { reason: 'Cambio de turno' },
        mockOperatorUser,
      );

      expect(result).toMatchObject({
        status: CashTransferStatus.CANCELLED,
        cancelledByUserID: mockUserID,
        cancellationReason: 'Cambio de turno',
      });
    });

    it('debe impedir que un tercero cancele la transferencia de otro usuario', async () => {
      const otherUser: JwtPayload = {
        ...mockOperatorUser,
        userId: 'user-uuid-0000',
        id: 'user-uuid-0000',
      };

      await expect(
        service.cancel(
          mockRegisterID,
          mockSessionID,
          mockTransferID,
          { reason: 'No me corresponde' },
          otherUser,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findAll', () => {
    it('debe listar las transferencias enviadas por la sesión', async () => {
      const transfers = [buildTransfer()];
      mockTransferQueryBuilder.getMany.mockResolvedValue(transfers);

      const query: QueryCashTransfersDto = {
        direction: CashTransferDirection.SENT,
        status: CashTransferStatus.PENDING,
      };
      const result = await service.findAll(
        mockRegisterID,
        mockSessionID,
        query,
        mockOperatorUser,
      );

      expect(result).toEqual(transfers);
      expect(mockTransferQueryBuilder.andWhere).toHaveBeenCalledWith(
        'transfer.sourceSessionID = :sessionID',
        { sessionID: mockSessionID },
      );
      expect(mockTransferQueryBuilder.andWhere).toHaveBeenCalledWith(
        'transfer.status = :status',
        { status: CashTransferStatus.PENDING },
      );
    });

    it('debe rechazar un rango de fechas invertido', async () => {
      await expect(
        service.findAll(
          mockRegisterID,
          mockSessionID,
          { from: '2026-09-30T00:00:00.000Z', to: '2026-09-01T00:00:00.000Z' },
          mockOperatorUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe lanzar NotFoundException si la transferencia no pertenece a la sesión', async () => {
      mockTransferRepo.findOne.mockResolvedValue(
        buildTransfer({ sourceSessionID: 'otra-sesion' }),
      );

      await expect(
        service.findOne(
          mockRegisterID,
          mockSessionID,
          mockTransferID,
          mockOperatorUser,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
