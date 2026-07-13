import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StoreMonthlyTarget } from './entities/store-monthly-target.entity';
import { CreateStoreMonthlyTargetDto } from './dto/create-store-monthly-target.dto';
import { UpdateStoreMonthlyTargetDto } from './dto/update-store-monthly-target.dto';
import { Store } from '../stores/entities/store.entity';

@Injectable()
export class StoreMonthlyTargetsService {
  constructor(
    @InjectRepository(StoreMonthlyTarget)
    private readonly targetRepository: Repository<StoreMonthlyTarget>,
    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,
  ) {}

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
    const { storeID, period, targetAmount } = createStoreMonthlyTargetDto;

    const store = await this.storeRepository.findOne({
      where: { storeID },
    });

    if (!store) {
      throw new NotFoundException(`Tienda con ID ${storeID} no encontrada`);
    }

    const normalizedPeriod = this.normalizePeriod(period);
    const existingTarget = await this.targetRepository.findOne({
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

    const target = this.targetRepository.create({
      store,
      period: normalizedPeriod,
      targetAmount,
    });

    return this.targetRepository.save(target);
  }

  findAll(): Promise<StoreMonthlyTarget[]> {
    return this.targetRepository.find({
      relations: ['store'],
      order: {
        period: 'DESC',
        createdAt: 'DESC',
      },
    });
  }

  async findOne(id: string): Promise<StoreMonthlyTarget> {
    const target = await this.targetRepository.findOne({
      where: { id },
      relations: ['store'],
    });

    if (!target) {
      throw new NotFoundException(`Meta mensual con ID ${id} no encontrada`);
    }

    return target;
  }

  async getCurrentTargetByStore(storeID: string): Promise<number> {
    return this.getTargetByStoreAndPeriod(storeID, undefined);
  }

  async getTargetByStoreAndPeriod(
    storeID: string,
    period?: string,
  ): Promise<number> {
    const store = await this.storeRepository.findOne({ where: { storeID } });
    if (!store) {
      throw new NotFoundException(`Tienda con ID ${storeID} no encontrada`);
    }

    const normalizedPeriod = period
      ? this.normalizeFlexiblePeriodString(period)
      : this.getCurrentMonthStart();

    const target = await this.targetRepository.findOne({
      where: {
        store: { storeID },
        period: normalizedPeriod,
      },
    });

    return target ? Number(target.targetAmount) : 0;
  }

  private normalizeFlexiblePeriodString(period: string): Date {
    // Accepts YYYY/MM/DD, YYYY/MM, YYYY-MM-DD, YYYY-MM
    const normalized = period.replace(/\//g, '-');
    const parts = normalized.split('-').map((p) => p.padStart(2, '0'));

    let dateStr = '';
    if (parts.length === 2) {
      // YYYY-MM
      dateStr = `${parts[0]}-${parts[1]}-01`;
    } else if (parts.length === 3) {
      // YYYY-MM-DD
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
    const store = await this.storeRepository.findOne({ where: { storeID } });
    if (!store) {
      throw new NotFoundException(`Tienda con ID ${storeID} no encontrada`);
    }

    const periodStart = upsertDto.period
      ? this.normalizeFlexiblePeriodString(upsertDto.period)
      : this.getCurrentMonthStart();

    this.assertEditable(periodStart);

    // Try find existing
    const existing = await this.targetRepository.findOne({
      where: { store: { storeID }, period: periodStart },
    });

    if (existing) {
      existing.targetAmount = upsertDto.targetAmount;
      return this.targetRepository.save(existing);
    }

    const created = this.targetRepository.create({
      store,
      period: periodStart,
      targetAmount: upsertDto.targetAmount,
    });

    return this.targetRepository.save(created);
  }

  async update(
    id: string,
    updateStoreMonthlyTargetDto: UpdateStoreMonthlyTargetDto,
  ): Promise<StoreMonthlyTarget> {
    const target = await this.findOne(id);
    this.assertEditable(this.normalizePeriod(target.period));

    if (updateStoreMonthlyTargetDto.targetAmount !== undefined) {
      target.targetAmount = updateStoreMonthlyTargetDto.targetAmount;
    }

    return this.targetRepository.save(target);
  }

  async remove(id: string): Promise<void> {
    const target = await this.findOne(id);
    this.assertEditable(this.normalizePeriod(target.period));
    await this.targetRepository.remove(target);
  }
}
