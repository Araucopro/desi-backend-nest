import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { StoreMonthlyTarget } from './entities/store-monthly-target.entity';
import { CreateStoreMonthlyTargetDto } from './dto/create-store-monthly-target.dto';
import { UpdateStoreMonthlyTargetDto } from './dto/update-store-monthly-target.dto';
import { Store } from '../stores/entities/store.entity';
import { TenantContextService } from '../multitenant/tenant-context.service';
import { TransactionRunnerService } from '../common/services/transaction-runner.service';

@Injectable()
export class StoreMonthlyTargetsService {
  constructor(
    @InjectRepository(StoreMonthlyTarget)
    private readonly targetRepository: Repository<StoreMonthlyTarget>,
    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,
    @Optional() private readonly tenantContext?: TenantContextService,
    @Optional() private readonly transactionRunner?: TransactionRunnerService,
  ) {}

  private runInTransaction<T>(
    callback: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    if (this.transactionRunner) {
      return this.transactionRunner.run(callback);
    }

    if (this.tenantContext) {
      return this.tenantContext.transaction(callback);
    }
    return callback(this.targetRepository.manager);
  }

  private normalizePeriod(period: string | Date): Date {
    const input = typeof period === 'string' ? new Date(period) : period;

    if (Number.isNaN(input.getTime())) {
      throw new BadRequestException('El período enviado no es válido');
    }

    return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), 1));
  }

  private getCurrentMonthStart(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  }

  private assertEditable(period: Date): void {
    const currentMonthStart = this.getCurrentMonthStart();
    if (period < currentMonthStart) {
      throw new BadRequestException(
        'No se puede modificar una meta correspondiente a un mes pasado',
      );
    }
  }

  async create(
    createStoreMonthlyTargetDto: CreateStoreMonthlyTargetDto,
  ): Promise<StoreMonthlyTarget> {
    return this.runInTransaction(async (manager) => {
      const { storeID, period, targetAmount } = createStoreMonthlyTargetDto;

      const store = await manager.getRepository(Store).findOne({
        where: { storeID },
      });

      if (!store) {
        throw new NotFoundException(`Tienda con ID ${storeID} no encontrada`);
      }

      const normalizedPeriod = this.normalizePeriod(period);
      const existingTarget = await manager
        .getRepository(StoreMonthlyTarget)
        .findOne({
          where: {
            store: { storeID },
            period: normalizedPeriod,
          },
        });

      if (existingTarget) {
        throw new BadRequestException(
          'Ya existe una meta para esa tienda y ese mes',
        );
      }

      const target = manager.getRepository(StoreMonthlyTarget).create({
        store,
        period: normalizedPeriod,
        targetAmount,
        tenantID: this.tenantContext?.getTenantId(),
      });

      return manager.getRepository(StoreMonthlyTarget).save(target);
    });
  }

  findAll(): Promise<StoreMonthlyTarget[]> {
    return this.runInTransaction((manager) =>
      manager.getRepository(StoreMonthlyTarget).find({
        relations: ['store'],
        order: {
          period: 'DESC',
          createdAt: 'DESC',
        },
      }),
    );
  }

  async findOne(id: string): Promise<StoreMonthlyTarget> {
    return this.runInTransaction(async (manager) => {
      const target = await manager.getRepository(StoreMonthlyTarget).findOne({
        where: { id },
        relations: ['store'],
      });

      if (!target) {
        throw new NotFoundException(`Meta mensual con ID ${id} no encontrada`);
      }

      return target;
    });
  }

  async getCurrentTargetByStore(storeID: string): Promise<number> {
    return this.getTargetByStoreAndPeriod(storeID, undefined);
  }

  async getTargetByStoreAndPeriod(
    storeID: string,
    period?: string,
  ): Promise<number> {
    return this.runInTransaction(async (manager) => {
      const store = await manager
        .getRepository(Store)
        .findOne({ where: { storeID } });
      if (!store) {
        throw new NotFoundException(`Tienda con ID ${storeID} no encontrada`);
      }

      const normalizedPeriod = period
        ? this.normalizeFlexiblePeriodString(period)
        : this.getCurrentMonthStart();

      const target = await manager.getRepository(StoreMonthlyTarget).findOne({
        where: {
          store: { storeID },
          period: normalizedPeriod,
        },
      });

      return target ? Number(target.targetAmount) : 0;
    });
  }

  private normalizeFlexiblePeriodString(period: string): Date {
    const normalized = period.replace(/\//g, '-');
    const parts = normalized.split('-').map((p) => p.padStart(2, '0'));

    let dateStr = '';
    if (parts.length === 2) {
      dateStr = `${parts[0]}-${parts[1]}-01`;
    } else if (parts.length === 3) {
      dateStr = `${parts[0]}-${parts[1]}-${parts[2]}`;
    } else {
      throw new BadRequestException('Formato de período inválido');
    }

    return this.normalizePeriod(dateStr);
  }

  async upsertByStore(
    storeID: string,
    upsertDto: { period?: string; targetAmount: number },
  ): Promise<StoreMonthlyTarget> {
    return this.runInTransaction(async (manager) => {
      const store = await manager
        .getRepository(Store)
        .findOne({ where: { storeID } });
      if (!store) {
        throw new NotFoundException(`Tienda con ID ${storeID} no encontrada`);
      }

      const periodStart = upsertDto.period
        ? this.normalizeFlexiblePeriodString(upsertDto.period)
        : this.getCurrentMonthStart();

      this.assertEditable(periodStart);

      const existing = await manager.getRepository(StoreMonthlyTarget).findOne({
        where: { store: { storeID }, period: periodStart },
      });

      if (existing) {
        existing.targetAmount = upsertDto.targetAmount;
        return manager.getRepository(StoreMonthlyTarget).save(existing);
      }

      const created = manager.getRepository(StoreMonthlyTarget).create({
        store,
        period: periodStart,
        targetAmount: upsertDto.targetAmount,
        tenantID: this.tenantContext?.getTenantId(),
      });

      return manager.getRepository(StoreMonthlyTarget).save(created);
    });
  }

  async update(
    id: string,
    updateStoreMonthlyTargetDto: UpdateStoreMonthlyTargetDto,
  ): Promise<StoreMonthlyTarget> {
    return this.runInTransaction(async (manager) => {
      const repo = manager.getRepository(StoreMonthlyTarget);
      const target = await repo.findOne({
        where: { id },
        relations: ['store'],
      });
      if (!target)
        throw new NotFoundException(`Meta mensual con ID ${id} no encontrada`);
      this.assertEditable(this.normalizePeriod(target.period));

      if (updateStoreMonthlyTargetDto.targetAmount !== undefined) {
        target.targetAmount = updateStoreMonthlyTargetDto.targetAmount;
      }

      return repo.save(target);
    });
  }

  async remove(id: string): Promise<void> {
    return this.runInTransaction(async (manager) => {
      const repo = manager.getRepository(StoreMonthlyTarget);
      const target = await repo.findOne({ where: { id } });
      if (!target)
        throw new NotFoundException(`Meta mensual con ID ${id} no encontrada`);
      this.assertEditable(this.normalizePeriod(target.period));
      await repo.remove(target);
    });
  }
}
