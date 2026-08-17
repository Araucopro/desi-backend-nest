import { Injectable, Optional } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import {
  StoreTransfer,
  TransferStatus,
} from './entities/store-transfer.entity';
import { StoreTransferItem } from './entities/store-transfer-item.entity';
import { CreateStoreTransferDto } from './dto/create-store-transfer.dto';
import { AddTransferItemDto } from './dto/add-transfer-item.dto';
import { ListTransfersFilterDto } from './dto/list-transfers-filter.dto';
import { TenantContextService } from '../multitenant/tenant-context.service';
import { TransactionRunnerService } from '../common/services/transaction-runner.service';
import {
  applyTransferMovements,
  createTransferEntity,
  createTransferItemEntity,
  findTransferForUpdate,
  findTransferItems,
} from './transfers-repository.helpers';
import {
  buildTransferCompletionPlan,
  ensureDifferentStores,
  ensureTransferModifiable,
} from './transfers-engine';

@Injectable()
export class TransfersService {
  constructor(
    private readonly dataSource: DataSource,
    @Optional() private readonly tenantContext?: TenantContextService,
    @Optional() private readonly transactionRunner?: TransactionRunnerService,
  ) {}

  private runInTransaction<T>(
    callback: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    if (this.transactionRunner) {
      return this.transactionRunner.run(callback);
    }

    return this.tenantContext
      ? this.tenantContext.transaction(callback)
      : this.dataSource.transaction(callback);
  }

  async createTransfer(
    createDto: CreateStoreTransferDto,
  ): Promise<StoreTransfer> {
    ensureDifferentStores(
      createDto.originStoreID,
      createDto.destinationStoreID,
    );

    return this.runInTransaction(async (manager) => {
      const transfer = createTransferEntity(manager, {
        originStoreID: createDto.originStoreID,
        destinationStoreID: createDto.destinationStoreID,
      });
      return manager.save(transfer);
    });
  }

  async addItem(
    transferID: string,
    addItemDto: AddTransferItemDto,
  ): Promise<StoreTransferItem> {
    return this.runInTransaction(async (manager) => {
      const transfer = await findTransferForUpdate(manager, transferID);
      ensureTransferModifiable(transfer.status);

      const item = createTransferItemEntity(manager, {
        transferID,
        variationID: addItemDto.variationID,
        quantity: addItemDto.quantity,
      });
      return manager.save(item);
    });
  }

  async completeTransfer(transferID: string): Promise<StoreTransfer> {
    return this.runInTransaction(async (manager) => {
      const transfer = await findTransferForUpdate(manager, transferID);
      const items = await findTransferItems(manager, transferID);
      const plan = buildTransferCompletionPlan({ transfer, items });

      await applyTransferMovements(manager, plan, this.tenantContext);

      transfer.items = items;
      transfer.status = TransferStatus.COMPLETED;
      transfer.completedAt = new Date();

      return manager.save(transfer);
    });
  }

  async getTransfer(transferID: string) {
    return this.runInTransaction(async (manager) => {
      return manager.getRepository(StoreTransfer).findOne({
        where: { transferID },
        relations: [
          'items',
          'items.variation',
          'originStore',
          'destinationStore',
        ],
      });
    });
  }

  async findAll(filters: ListTransfersFilterDto) {
    return this.runInTransaction(async (manager) => {
      const {
        originStoreID,
        destinationStoreID,
        status,
        page = 1,
        limit = 20,
      } = filters;

      const query = manager
        .getRepository(StoreTransfer)
        .createQueryBuilder('transfer')
        .leftJoinAndSelect('transfer.originStore', 'originStore')
        .leftJoinAndSelect('transfer.destinationStore', 'destinationStore')
        .leftJoinAndSelect('transfer.items', 'items')
        .leftJoinAndSelect('items.variation', 'variation')
        .orderBy('transfer.createdAt', 'DESC');

      if (originStoreID) {
        query.andWhere('originStore.storeID = :originStoreID', {
          originStoreID,
        });
      }
      if (destinationStoreID) {
        query.andWhere('destinationStore.storeID = :destinationStoreID', {
          destinationStoreID,
        });
      }
      if (status) {
        query.andWhere('transfer.status = :status', { status });
      }

      const [data, total] = await query
        .skip((page - 1) * limit)
        .take(limit)
        .getManyAndCount();

      return {
        data,
        total,
        page,
        lastPage: Math.ceil(total / limit),
      };
    });
  }
}
