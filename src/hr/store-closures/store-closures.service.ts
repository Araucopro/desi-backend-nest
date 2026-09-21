import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, Repository } from 'typeorm';
import { Store } from '../../stores/entities/store.entity';
import { TenantContextService } from '../../multitenant/tenant-context.service';
import {
  assertDateRange,
  eachDate,
  parseDateOnly,
} from '../common/date-range.util';
import { CreateStoreClosureBulkDto } from './dto/create-store-closure-bulk.dto';
import { CreateStoreClosureDto } from './dto/create-store-closure.dto';
import { StoreClosure } from './entities/store-closure.entity';

export interface HrActor {
  userID?: string;
  masterUserID?: string;
}

@Injectable()
export class StoreClosuresService {
  constructor(
    @InjectRepository(StoreClosure)
    private readonly closureRepository: Repository<StoreClosure>,
    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,
    @Optional() private readonly tenantContext?: TenantContextService,
  ) {}

  private runInTransaction<T>(
    callback: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return this.tenantContext
      ? this.tenantContext.transaction(callback)
      : this.closureRepository.manager.transaction(callback);
  }

  private tenantID(): string | undefined {
    return this.tenantContext?.get(false)?.tenantId;
  }

  private async assertStore(
    manager: EntityManager,
    storeID: string,
  ): Promise<Store> {
    const where = this.tenantID()
      ? { storeID, tenantID: this.tenantID() }
      : { storeID };
    const store = await manager.getRepository(Store).findOne({ where });
    if (!store) throw new NotFoundException('Tienda no encontrada');
    return store;
  }

  private async assertNoOverlap(
    manager: EntityManager,
    storeID: string,
    startDate: string,
    endDate: string,
  ): Promise<void> {
    await manager.query(
      `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
      [`hr:closure:${this.tenantID() ?? 'default'}:${storeID}`],
    );
    const query = manager
      .getRepository(StoreClosure)
      .createQueryBuilder('closure')
      .where('closure.storeID = :storeID', { storeID })
      .andWhere('closure.cancelledAt IS NULL')
      .andWhere(
        'closure.startDate <= :endDate AND closure.endDate >= :startDate',
        { startDate, endDate },
      );
    if (this.tenantID()) {
      query.andWhere('closure.tenantID = :tenantID', {
        tenantID: this.tenantID(),
      });
    }
    if (await query.getExists()) {
      throw new ConflictException('El rango se solapa con un cierre existente');
    }
  }

  private async createOne(
    manager: EntityManager,
    storeID: string,
    dto: CreateStoreClosureDto,
    actor: HrActor,
  ): Promise<StoreClosure> {
    assertDateRange(dto.startDate, dto.endDate);
    await this.assertNoOverlap(manager, storeID, dto.startDate, dto.endDate);
    const store = await this.assertStore(manager, storeID);
    const closure = manager.getRepository(StoreClosure).create({
      tenantID: this.tenantID(),
      storeID,
      store,
      startDate: dto.startDate,
      endDate: dto.endDate,
      reason: dto.reason.trim(),
      createdBy: actor.userID ?? null,
      cancelledAt: null,
      cancelledBy: null,
      cancellationReason: null,
    });
    return manager.getRepository(StoreClosure).save(closure);
  }

  create(
    storeID: string,
    dto: CreateStoreClosureDto,
    actor: HrActor,
  ): Promise<StoreClosure> {
    return this.runInTransaction((manager) =>
      this.createOne(manager, storeID, dto, actor),
    );
  }

  async createBulk(
    storeID: string,
    dto: CreateStoreClosureBulkDto,
    actor: HrActor,
  ): Promise<StoreClosure[]> {
    const dates = this.resolveBulkDates(dto);
    return this.runInTransaction(async (manager) => {
      const result: StoreClosure[] = [];
      for (const date of dates) {
        result.push(
          await this.createOne(
            manager,
            storeID,
            { startDate: date, endDate: date, reason: dto.reason },
            actor,
          ),
        );
      }
      return result;
    });
  }

  private resolveBulkDates(dto: CreateStoreClosureBulkDto): string[] {
    if (dto.dates?.length) {
      return [...new Set(dto.dates)].sort();
    }
    if (!dto.from || !dto.to) {
      throw new BadRequestException(
        'Debe enviar dates o el rango from/to para crear cierres masivos',
      );
    }
    const dates = eachDate(dto.from, dto.to);
    if (!dto.weekdays?.length) return dates;
    const weekdays = new Set(dto.weekdays);
    return dates.filter((date) =>
      weekdays.has(parseDateOnly(date, 'date').getUTCDay()),
    );
  }

  async findAll(
    storeID: string,
    from?: string,
    to?: string,
  ): Promise<StoreClosure[]> {
    if (from && to) assertDateRange(from, to);
    return this.runInTransaction(async (manager) => {
      const query = manager
        .getRepository(StoreClosure)
        .createQueryBuilder('closure')
        .leftJoinAndSelect('closure.store', 'store')
        .where('closure.storeID = :storeID', { storeID })
        .andWhere('closure.cancelledAt IS NULL')
        .orderBy('closure.startDate', 'ASC');
      if (this.tenantID()) {
        query.andWhere('closure.tenantID = :tenantID', {
          tenantID: this.tenantID(),
        });
      }
      if (from) query.andWhere('closure.endDate >= :from', { from });
      if (to) query.andWhere('closure.startDate <= :to', { to });
      return query.getMany();
    });
  }

  async cancel(
    storeID: string,
    id: string,
    actor: HrActor,
    reason?: string,
  ): Promise<void> {
    await this.runInTransaction(async (manager) => {
      const where = {
        id,
        storeID,
        ...(this.tenantID() ? { tenantID: this.tenantID() } : {}),
        cancelledAt: IsNull(),
      };
      const closure = await manager.getRepository(StoreClosure).findOne({
        where,
      });
      if (!closure) throw new NotFoundException('Cierre no encontrado');
      closure.cancelledAt = new Date();
      closure.cancelledBy = actor.userID ?? null;
      closure.cancellationReason = reason?.trim() || 'Cierre cancelado';
      await manager.getRepository(StoreClosure).save(closure);
    });
  }
}
