import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  StoreTransfer,
  TransferStatus,
} from './entities/store-transfer.entity';
import { StoreTransferItem } from './entities/store-transfer-item.entity';
import { CreateStoreTransferDto } from './dto/create-store-transfer.dto';
import { AddTransferItemDto } from './dto/add-transfer-item.dto';
import { ListTransfersFilterDto } from './dto/list-transfers-filter.dto';
import { InventoryService } from '../inventory/inventory.service';
import { InventoryMovementReason } from '../inventory/entities/inventory-movement.entity';

@Injectable()
export class TransfersService {
  constructor(
    @InjectRepository(StoreTransfer)
    private readonly transfersRepository: Repository<StoreTransfer>,
    @InjectRepository(StoreTransferItem)
    private readonly transferItemsRepository: Repository<StoreTransferItem>,
    private readonly inventoryService: InventoryService,
    private readonly dataSource: DataSource,
  ) {}

  async createTransfer(
    createDto: CreateStoreTransferDto,
  ): Promise<StoreTransfer> {
    if (createDto.originStoreID === createDto.destinationStoreID) {
      throw new BadRequestException(
        'Origin and Destination stores must be different',
      );
    }
    const transfer = this.transfersRepository.create({
      originStore: { storeID: createDto.originStoreID },
      destinationStore: { storeID: createDto.destinationStoreID },
      status: TransferStatus.PENDING,
    });
    return this.transfersRepository.save(transfer);
  }

  async addItem(
    transferID: string,
    addItemDto: AddTransferItemDto,
  ): Promise<StoreTransferItem> {
    const transfer = await this.transfersRepository.findOne({
      where: { transferID },
    });
    if (!transfer) throw new NotFoundException('Transfer not found');
    if (transfer.status !== TransferStatus.PENDING) {
      throw new BadRequestException(
        'Cannot add items to a non-pending transfer',
      );
    }

    const item = this.transferItemsRepository.create({
      transfer: { transferID },
      variation: { variationID: addItemDto.variationID },
      quantity: addItemDto.quantity,
    });
    return this.transferItemsRepository.save(item);
  }

  async completeTransfer(transferID: string): Promise<StoreTransfer> {
    return this.dataSource.transaction(async (manager) => {
      const transfer = await manager.findOne(StoreTransfer, {
        where: { transferID },
        relations: [
          'items',
          'originStore',
          'destinationStore',
          'items.variation',
        ],
      });

      if (!transfer) throw new NotFoundException('Transfer not found');
      if (transfer.status !== TransferStatus.PENDING) {
        throw new BadRequestException('Transfer is not pending');
      }
      if (!transfer.items || transfer.items.length === 0) {
        throw new BadRequestException('Transfer has no items');
      }

      for (const item of transfer.items) {
        await this.inventoryService.createMovement({
          storeID: transfer.originStore.storeID,
          variationID: item.variation.variationID,
          quantity: item.quantity,
          reason: InventoryMovementReason.TRANSFER_OUT,
          referenceID: transfer.transferID,
        });

        await this.inventoryService.createMovement({
          storeID: transfer.destinationStore.storeID,
          variationID: item.variation.variationID,
          quantity: item.quantity,
          reason: InventoryMovementReason.TRANSFER_IN,
          referenceID: transfer.transferID,
        });
      }

      transfer.status = TransferStatus.COMPLETED;
      transfer.completedAt = new Date();

      return manager.save(transfer);
    });
  }

  async getTransfer(transferID: string) {
    return this.transfersRepository.findOne({
      where: { transferID },
      relations: [
        'items',
        'items.variation',
        'originStore',
        'destinationStore',
      ],
    });
  }

  async findAll(filters: ListTransfersFilterDto) {
    const {
      originStoreID,
      destinationStoreID,
      status,
      page = 1,
      limit = 20,
    } = filters;

    const query = this.transfersRepository
      .createQueryBuilder('transfer')
      .leftJoinAndSelect('transfer.originStore', 'originStore')
      .leftJoinAndSelect('transfer.destinationStore', 'destinationStore')
      .leftJoinAndSelect('transfer.items', 'items')
      .leftJoinAndSelect('items.variation', 'variation')
      .orderBy('transfer.createdAt', 'DESC');

    if (originStoreID) {
      query.andWhere('originStore.storeID = :originStoreID', { originStoreID });
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
  }
}
