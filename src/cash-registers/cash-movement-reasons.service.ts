import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { isUniqueViolation } from '../common/utils/db-errors.util';
import { TenantContextService } from '../multitenant/tenant-context.service';
import { CreateCashMovementReasonDto } from './dto/create-cash-movement-reason.dto';
import { QueryCashMovementReasonsDto } from './dto/query-cash-movement-reasons.dto';
import { UpdateCashMovementReasonDto } from './dto/update-cash-movement-reason.dto';
import { CashMovementType } from './entities/cash-movement.entity';
import {
  CashMovementReason,
  DEFAULT_CASH_MOVEMENT_REASONS,
} from './entities/cash-movement-reason.entity';

@Injectable()
export class CashMovementReasonsService {
  constructor(
    @InjectRepository(CashMovementReason)
    private readonly cashMovementReasonRepository: Repository<CashMovementReason>,
    @Optional() private readonly tenantContext?: TenantContextService,
  ) {}

  private runInTransaction<T>(
    callback: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return this.tenantContext
      ? this.tenantContext.transaction(callback)
      : this.cashMovementReasonRepository.manager.transaction(callback);
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
   * Resuelve una razón vigente del catálogo. Se ejecuta con el `EntityManager`
   * de la transacción del movimiento para que la validación y el registro sean
   * atómicos.
   */
  async getActiveByCodeOrFail(
    manager: EntityManager,
    tenantID: string,
    code: string,
    direction: CashMovementType,
  ): Promise<CashMovementReason> {
    const normalizedCode = this.normalizeCode(code);
    const reason = await manager.getRepository(CashMovementReason).findOne({
      where: { tenantID, code: normalizedCode },
    });

    if (!reason || !reason.active) {
      throw new BadRequestException(
        `La razón "${normalizedCode}" no existe o no está activa en el catálogo de razones de caja`,
      );
    }

    if (reason.type && reason.type !== direction) {
      throw new BadRequestException(
        `La razón "${reason.name}" solo admite movimientos ${reason.type}, no ${direction}`,
      );
    }

    return reason;
  }

  async create(dto: CreateCashMovementReasonDto): Promise<CashMovementReason> {
    const tenantID = this.getEffectiveTenantId();

    return this.runInTransaction(async (manager) => {
      const repository = manager.getRepository(CashMovementReason);
      const code = this.normalizeCode(dto.code);

      const existing = await repository.findOne({ where: { tenantID, code } });
      if (existing) {
        throw new ConflictException(
          `Ya existe una razón de movimiento con el código "${code}"`,
        );
      }

      const reason = repository.create({
        tenantID,
        code,
        name: dto.name.trim(),
        type: dto.type ?? null,
        requiresApproval: dto.requiresApproval ?? false,
        active: dto.active ?? true,
      });

      try {
        return await repository.save(reason);
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ConflictException(
            `Ya existe una razón de movimiento con el código "${code}"`,
          );
        }
        throw error;
      }
    });
  }

  async findAll(
    query: QueryCashMovementReasonsDto,
  ): Promise<CashMovementReason[]> {
    const tenantID = this.getEffectiveTenantId();

    const queryBuilder = this.cashMovementReasonRepository
      .createQueryBuilder('reason')
      .where('reason.tenantID = :tenantID', { tenantID });

    if (query.active !== undefined) {
      queryBuilder.andWhere('reason.active = :active', {
        active: query.active,
      });
    }
    if (query.requiresApproval !== undefined) {
      queryBuilder.andWhere('reason.requiresApproval = :requiresApproval', {
        requiresApproval: query.requiresApproval,
      });
    }
    if (query.type) {
      // Las razones sin sentido asignado aplican a ambos (ej. ajustes).
      queryBuilder.andWhere('(reason.type = :type OR reason.type IS NULL)', {
        type: query.type,
      });
    }

    return queryBuilder.orderBy('reason.code', 'ASC').getMany();
  }

  async findOne(cashMovementReasonID: string): Promise<CashMovementReason> {
    const tenantID = this.getEffectiveTenantId();
    const reason = await this.cashMovementReasonRepository.findOne({
      where: { cashMovementReasonID, tenantID },
    });

    if (!reason) {
      throw new NotFoundException(
        `Razón de movimiento con ID ${cashMovementReasonID} no encontrada`,
      );
    }

    return reason;
  }

  async update(
    cashMovementReasonID: string,
    dto: UpdateCashMovementReasonDto,
  ): Promise<CashMovementReason> {
    const tenantID = this.getEffectiveTenantId();

    return this.runInTransaction(async (manager) => {
      const repository = manager.getRepository(CashMovementReason);
      const reason = await repository.findOne({
        where: { cashMovementReasonID, tenantID },
        lock: { mode: 'pessimistic_write' },
      });

      if (!reason) {
        throw new NotFoundException(
          `Razón de movimiento con ID ${cashMovementReasonID} no encontrada`,
        );
      }

      if (dto.name) {
        reason.name = dto.name.trim();
      }
      if (dto.type !== undefined) {
        reason.type = dto.type ?? null;
      }
      if (dto.requiresApproval !== undefined) {
        reason.requiresApproval = dto.requiresApproval;
      }
      if (dto.active !== undefined) {
        reason.active = dto.active;
      }

      return repository.save(reason);
    });
  }

  /**
   * Crea el catálogo estándar de razones de forma idempotente: los códigos ya
   * existentes se dejan intactos para no pisar la configuración del tenant.
   */
  async seedDefaults(): Promise<CashMovementReason[]> {
    const tenantID = this.getEffectiveTenantId();

    return this.runInTransaction(async (manager) => {
      const repository = manager.getRepository(CashMovementReason);
      const existing = await repository.find({ where: { tenantID } });
      const existingCodes = new Set(existing.map((item) => item.code));

      const missing = DEFAULT_CASH_MOVEMENT_REASONS.filter(
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
              requiresApproval: item.requiresApproval,
              active: true,
            }),
          ),
        );
      }

      return repository.find({ where: { tenantID }, order: { code: 'ASC' } });
    });
  }
}
