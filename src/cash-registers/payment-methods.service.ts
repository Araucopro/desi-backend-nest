import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, FindOptionsWhere, Repository } from 'typeorm';
import { isUniqueViolation } from '../common/utils/db-errors.util';
import { TenantContextService } from '../multitenant/tenant-context.service';
import { CreatePaymentMethodDto } from './dto/create-payment-method.dto';
import { QueryPaymentMethodsDto } from './dto/query-payment-methods.dto';
import { UpdatePaymentMethodDto } from './dto/update-payment-method.dto';
import {
  PaymentMethod,
  PaymentMethodType,
} from './entities/payment-method.entity';

type DefaultPaymentMethod = {
  code: string;
  name: string;
  type: PaymentMethodType;
  affectsCash: boolean;
};

const DEFAULT_PAYMENT_METHODS: readonly DefaultPaymentMethod[] = [
  {
    code: 'CASH',
    name: 'Efectivo',
    type: PaymentMethodType.CASH,
    affectsCash: true,
  },
  {
    code: 'DEBIT_CARD',
    name: 'Débito',
    type: PaymentMethodType.DEBIT_CARD,
    affectsCash: false,
  },
  {
    code: 'CREDIT_CARD',
    name: 'Crédito',
    type: PaymentMethodType.CREDIT_CARD,
    affectsCash: false,
  },
  {
    code: 'BANK_TRANSFER',
    name: 'Transferencia',
    type: PaymentMethodType.BANK_TRANSFER,
    affectsCash: false,
  },
];

@Injectable()
export class PaymentMethodsService {
  constructor(
    @InjectRepository(PaymentMethod)
    private readonly paymentMethodRepository: Repository<PaymentMethod>,
    @Optional() private readonly tenantContext?: TenantContextService,
  ) {}

  private runInTransaction<T>(
    callback: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return this.tenantContext
      ? this.tenantContext.transaction(callback)
      : this.paymentMethodRepository.manager.transaction(callback);
  }

  private getEffectiveTenantId(): string {
    const tenantId = this.tenantContext?.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('Contexto tenant no disponible');
    }
    return tenantId;
  }

  private normalizeCode(code: string): string {
    return code.trim().toUpperCase().replace(/\s+/g, '_');
  }

  /**
   * `affectsCash` es una consecuencia del tipo de medio de pago: solo el
   * efectivo mueve el saldo físico de la caja.
   */
  private resolveAffectsCash(
    type: PaymentMethodType,
    affectsCash?: boolean,
  ): boolean {
    if (type === PaymentMethodType.CASH) {
      if (affectsCash === false) {
        throw new BadRequestException(
          'Un medio de pago de tipo CASH siempre afecta el efectivo de la caja',
        );
      }
      return true;
    }

    if (affectsCash === true) {
      throw new BadRequestException(
        'Solo un medio de pago de tipo CASH puede afectar el efectivo de la caja',
      );
    }

    return false;
  }

  async create(dto: CreatePaymentMethodDto): Promise<PaymentMethod> {
    const tenantID = this.getEffectiveTenantId();

    return this.runInTransaction(async (manager) => {
      const repository = manager.getRepository(PaymentMethod);
      const code = this.normalizeCode(dto.code);

      const existing = await repository.findOne({
        where: { tenantID, code },
      });
      if (existing) {
        throw new ConflictException(
          `Ya existe un medio de pago con el código "${code}"`,
        );
      }

      const paymentMethod = repository.create({
        tenantID,
        code,
        name: dto.name.trim(),
        type: dto.type,
        affectsCash: this.resolveAffectsCash(dto.type, dto.affectsCash),
        active: dto.active ?? true,
      });

      try {
        return await repository.save(paymentMethod);
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ConflictException(
            `Ya existe un medio de pago con el código "${code}"`,
          );
        }
        throw error;
      }
    });
  }

  async findAll(query: QueryPaymentMethodsDto): Promise<PaymentMethod[]> {
    const tenantID = this.getEffectiveTenantId();
    const where: FindOptionsWhere<PaymentMethod> = { tenantID };

    if (query.active !== undefined) {
      where.active = query.active;
    }
    if (query.type) {
      where.type = query.type;
    }

    return this.paymentMethodRepository.find({
      where,
      order: { code: 'ASC' },
    });
  }

  async findOne(paymentMethodID: string): Promise<PaymentMethod> {
    const tenantID = this.getEffectiveTenantId();
    const paymentMethod = await this.paymentMethodRepository.findOne({
      where: { paymentMethodID, tenantID },
    });

    if (!paymentMethod) {
      throw new NotFoundException(
        `Medio de pago con ID ${paymentMethodID} no encontrado`,
      );
    }

    return paymentMethod;
  }

  async update(
    paymentMethodID: string,
    dto: UpdatePaymentMethodDto,
  ): Promise<PaymentMethod> {
    const tenantID = this.getEffectiveTenantId();

    return this.runInTransaction(async (manager) => {
      const repository = manager.getRepository(PaymentMethod);
      const paymentMethod = await repository.findOne({
        where: { paymentMethodID, tenantID },
        lock: { mode: 'pessimistic_write' },
      });

      if (!paymentMethod) {
        throw new NotFoundException(
          `Medio de pago con ID ${paymentMethodID} no encontrado`,
        );
      }

      const nextType = dto.type ?? paymentMethod.type;
      const nextAffectsCash =
        dto.affectsCash ??
        (dto.type && nextType !== PaymentMethodType.CASH
          ? false
          : paymentMethod.affectsCash);

      paymentMethod.type = nextType;
      paymentMethod.affectsCash = this.resolveAffectsCash(
        nextType,
        nextAffectsCash,
      );

      if (dto.name) {
        paymentMethod.name = dto.name.trim();
      }
      if (dto.active !== undefined) {
        paymentMethod.active = dto.active;
      }

      try {
        return await repository.save(paymentMethod);
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ConflictException(
            `Conflicto de unicidad al actualizar el medio de pago "${paymentMethod.code}"`,
          );
        }
        throw error;
      }
    });
  }

  /**
   * Crea el catálogo estándar (efectivo, débito, crédito, transferencia) de
   * forma idempotente: los códigos ya existentes se dejan intactos.
   */
  async seedDefaults(): Promise<PaymentMethod[]> {
    const tenantID = this.getEffectiveTenantId();

    return this.runInTransaction(async (manager) => {
      const repository = manager.getRepository(PaymentMethod);
      const existing = await repository.find({ where: { tenantID } });
      const existingCodes = new Set(existing.map((item) => item.code));

      const missing = DEFAULT_PAYMENT_METHODS.filter(
        (item) => !existingCodes.has(item.code),
      );

      if (missing.length) {
        await repository.save(
          missing.map((item) =>
            repository.create({
              tenantID,
              code: item.code,
              name: item.name,
              type: item.type,
              affectsCash: item.affectsCash,
              active: true,
            }),
          ),
        );
      }

      return repository.find({ where: { tenantID }, order: { code: 'ASC' } });
    });
  }
}
