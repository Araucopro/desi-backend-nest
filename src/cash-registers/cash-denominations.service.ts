import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { isUniqueViolation } from '../common/utils/db-errors.util';
import { TenantContextService } from '../multitenant/tenant-context.service';
import { toMoney } from './cash-registers.helpers';
import { CreateCashDenominationDto } from './dto/create-cash-denomination.dto';
import { QueryCashDenominationsDto } from './dto/query-cash-denominations.dto';
import { UpdateCashDenominationDto } from './dto/update-cash-denomination.dto';
import {
  CashDenomination,
  DEFAULT_CLP_CASH_DENOMINATIONS,
  formatCashDenominationLabel,
} from './entities/cash-denomination.entity';

@Injectable()
export class CashDenominationsService {
  constructor(
    @InjectRepository(CashDenomination)
    private readonly cashDenominationRepository: Repository<CashDenomination>,
    @Optional() private readonly tenantContext?: TenantContextService,
  ) {}

  private runInTransaction<T>(
    callback: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return this.tenantContext
      ? this.tenantContext.transaction(callback)
      : this.cashDenominationRepository.manager.transaction(callback);
  }

  private getEffectiveTenantId(): string {
    const tenantId = this.tenantContext?.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('Contexto tenant no disponible');
    }
    return tenantId;
  }

  /**
   * Resuelve las denominaciones vigentes del catálogo dentro de la transacción
   * del conteo, para que la validación y el registro de los ítems sean
   * atómicos. Falla si alguna no existe o está inactiva.
   */
  async resolveUsableByIds(
    manager: EntityManager,
    tenantID: string,
    cashDenominationIDs: string[],
  ): Promise<Map<string, CashDenomination>> {
    if (!cashDenominationIDs.length) return new Map();

    const denominations = await manager
      .getRepository(CashDenomination)
      .find({
        where: { tenantID, cashDenominationID: In(cashDenominationIDs) },
      });
    const denominationMap = new Map(
      denominations.map((denomination) => [
        denomination.cashDenominationID,
        denomination,
      ]),
    );

    for (const cashDenominationID of cashDenominationIDs) {
      const denomination = denominationMap.get(cashDenominationID);

      if (!denomination) {
        throw new NotFoundException(
          `Denominación con ID ${cashDenominationID} no encontrada en el catálogo`,
        );
      }

      if (!denomination.active) {
        throw new BadRequestException(
          `La denominación "${denomination.label}" está inactiva y no puede usarse en un conteo`,
        );
      }
    }

    return denominationMap;
  }

  async create(dto: CreateCashDenominationDto): Promise<CashDenomination> {
    const tenantID = this.getEffectiveTenantId();

    return this.runInTransaction(async (manager) => {
      const repository = manager.getRepository(CashDenomination);
      const value = toMoney(Number(dto.value));

      const existing = await repository.findOne({
        where: { tenantID, value, type: dto.type },
      });
      if (existing) {
        throw new ConflictException(
          `Ya existe la denominación ${existing.label} (${existing.type}) en el catálogo`,
        );
      }

      const denomination = repository.create({
        tenantID,
        value,
        type: dto.type,
        label: dto.label?.trim() || formatCashDenominationLabel(value),
        sortOrder: dto.sortOrder ?? Math.round(value / 100),
        active: dto.active ?? true,
      });

      try {
        return await repository.save(denomination);
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ConflictException(
            `Ya existe una denominación de ${value} (${dto.type}) en el catálogo`,
          );
        }
        throw error;
      }
    });
  }

  async findAll(query: QueryCashDenominationsDto): Promise<CashDenomination[]> {
    const tenantID = this.getEffectiveTenantId();

    const queryBuilder = this.cashDenominationRepository
      .createQueryBuilder('denomination')
      .where('denomination.tenantID = :tenantID', { tenantID });

    if (query.active !== undefined) {
      queryBuilder.andWhere('denomination.active = :active', {
        active: query.active,
      });
    }
    if (query.type) {
      queryBuilder.andWhere('denomination.type = :type', {
        type: query.type,
      });
    }

    return queryBuilder
      .orderBy('denomination.sortOrder', 'DESC')
      .addOrderBy('denomination.value', 'DESC')
      .getMany();
  }

  async findOne(cashDenominationID: string): Promise<CashDenomination> {
    const tenantID = this.getEffectiveTenantId();
    const denomination = await this.cashDenominationRepository.findOne({
      where: { cashDenominationID, tenantID },
    });

    if (!denomination) {
      throw new NotFoundException(
        `Denominación con ID ${cashDenominationID} no encontrada en el catálogo`,
      );
    }

    return denomination;
  }

  /**
   * Actualiza solo los atributos de presentación y vigencia: `value` y `type`
   * son la identidad de la denominación y permanecen inmutables.
   */
  async update(
    cashDenominationID: string,
    dto: UpdateCashDenominationDto,
  ): Promise<CashDenomination> {
    const tenantID = this.getEffectiveTenantId();

    return this.runInTransaction(async (manager) => {
      const repository = manager.getRepository(CashDenomination);
      const denomination = await repository.findOne({
        where: { cashDenominationID, tenantID },
        lock: { mode: 'pessimistic_write' },
      });

      if (!denomination) {
        throw new NotFoundException(
          `Denominación con ID ${cashDenominationID} no encontrada en el catálogo`,
        );
      }

      if (dto.label !== undefined) {
        denomination.label = dto.label.trim();
      }
      if (dto.sortOrder !== undefined) {
        denomination.sortOrder = dto.sortOrder;
      }
      if (dto.active !== undefined) {
        denomination.active = dto.active;
      }

      return repository.save(denomination);
    });
  }

  /**
   * Crea el catálogo estándar CLP de forma idempotente: las denominaciones ya
   * existentes se dejan intactas para no pisar la configuración del tenant.
   */
  async seedDefaults(): Promise<CashDenomination[]> {
    const tenantID = this.getEffectiveTenantId();

    return this.runInTransaction(async (manager) => {
      const repository = manager.getRepository(CashDenomination);
      const existing = await repository.find({ where: { tenantID } });
      const existingKeys = new Set(
        existing.map((item) => `${item.type}:${Number(item.value)}`),
      );

      const missing = DEFAULT_CLP_CASH_DENOMINATIONS.filter(
        (item) => !existingKeys.has(`${item.type}:${item.value}`),
      );

      if (missing.length) {
        await repository.save(
          missing.map((item) =>
            repository.create({
              tenantID,
              value: item.value,
              type: item.type,
              label: item.label,
              sortOrder: item.sortOrder,
              active: true,
            }),
          ),
        );
      }

      return repository.find({
        where: { tenantID },
        order: { sortOrder: 'DESC', value: 'DESC' },
      });
    });
  }
}
