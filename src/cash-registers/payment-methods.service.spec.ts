import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TenantContextService } from '../multitenant/tenant-context.service';
import { PaymentMethodsService } from './payment-methods.service';
import {
  PaymentMethod,
  PaymentMethodType,
} from './entities/payment-method.entity';

describe('PaymentMethodsService (Hito 2)', () => {
  let service: PaymentMethodsService;

  const mockTenantID = 'tenant-uuid-1111';

  const mockPaymentMethodRepo: {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    manager: { transaction: jest.Mock };
  } = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((values: object) => ({ ...values })),
    save: jest.fn((entity: object) => Promise.resolve(entity)),
    manager: {
      transaction: jest.fn((cb: (manager: unknown) => unknown) =>
        cb(mockEntityManager),
      ),
    },
  };

  const mockEntityManager: { getRepository: jest.Mock } = {
    getRepository: jest.fn(() => mockPaymentMethodRepo),
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
        PaymentMethodsService,
        {
          provide: getRepositoryToken(PaymentMethod),
          useValue: mockPaymentMethodRepo,
        },
        {
          provide: TenantContextService,
          useValue: mockTenantContext,
        },
      ],
    }).compile();

    service = module.get<PaymentMethodsService>(PaymentMethodsService);
  });

  it('debe lanzar ConflictException si el código ya existe en el tenant', async () => {
    mockPaymentMethodRepo.findOne.mockResolvedValue({
      paymentMethodID: 'existing',
      code: 'CASH',
    });

    await expect(
      service.create({
        code: 'cash',
        name: 'Efectivo',
        type: PaymentMethodType.CASH,
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('debe normalizar el código y derivar affectsCash=true para CASH', async () => {
    mockPaymentMethodRepo.findOne.mockResolvedValue(null);

    const result = await service.create({
      code: ' efectivo caja ',
      name: 'Efectivo',
      type: PaymentMethodType.CASH,
    });

    expect(result).toMatchObject({
      tenantID: mockTenantID,
      code: 'EFECTIVO_CAJA',
      affectsCash: true,
      active: true,
    });
  });

  it('debe rechazar affectsCash=true en medios que no son efectivo', async () => {
    mockPaymentMethodRepo.findOne.mockResolvedValue(null);

    await expect(
      service.create({
        code: 'DEBIT_CARD',
        name: 'Débito',
        type: PaymentMethodType.DEBIT_CARD,
        affectsCash: true,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('debe recalcular affectsCash=false al cambiar el tipo desde CASH', async () => {
    mockPaymentMethodRepo.findOne.mockResolvedValue({
      paymentMethodID: 'method-1',
      tenantID: mockTenantID,
      code: 'CASH',
      name: 'Efectivo',
      type: PaymentMethodType.CASH,
      affectsCash: true,
      active: true,
    });

    const result = await service.update('method-1', {
      type: PaymentMethodType.DEBIT_CARD,
    });

    expect(result).toMatchObject({
      type: PaymentMethodType.DEBIT_CARD,
      affectsCash: false,
    });
  });

  it('debe sembrar solo los medios de pago que faltan', async () => {
    mockPaymentMethodRepo.find.mockResolvedValueOnce([
      { code: 'CASH' },
      { code: 'DEBIT_CARD' },
    ]);
    mockPaymentMethodRepo.find.mockResolvedValueOnce([
      { code: 'CASH' },
      { code: 'DEBIT_CARD' },
      { code: 'CREDIT_CARD' },
      { code: 'BANK_TRANSFER' },
    ]);

    const result = await service.seedDefaults();

    const saved = (
      mockPaymentMethodRepo.save.mock.calls as unknown[][]
    )[0][0] as Array<{
      code: string;
    }>;
    expect(saved.map((item) => item.code)).toEqual([
      'CREDIT_CARD',
      'BANK_TRANSFER',
    ]);
    expect(result).toHaveLength(4);
  });
});
