import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Sale } from './entities/sale.entity';
import { SaleProduct } from './entities/sale-product.entity';
import { CreateSaleDto } from './dto/create-sale.dto';
import { UpdateSaleStatusDto } from './dto/update-sale-status.dto';
import { ProductVariation } from '../products/entities/product-variation.entity';
import { Store } from '../stores/entities/store.entity';
import { StoreProduct } from '../relations/storeproduct/entities/storeproduct.entity';
import {
  InventoryMovement,
  InventoryMovementReason,
} from '../inventory/entities/inventory-movement.entity';

@Injectable()
export class SalesService {
  constructor(
    @InjectRepository(Sale)
    private readonly saleRepository: Repository<Sale>,
    @InjectRepository(SaleProduct)
    private readonly saleProductRepository: Repository<SaleProduct>,
    private readonly dataSource: DataSource,
  ) {}

  private async findOneInTransaction(
    manager: EntityManager,
    id: string,
  ): Promise<Sale> {
    const sale = await manager.findOne(Sale, {
      where: { saleID: id },
      relations: ['store', 'saleProducts', 'saleProducts.variation'],
    });

    if (!sale) {
      throw new NotFoundException(`Venta con ID ${id} no encontrada`);
    }

    return sale;
  }

  async create(createSaleDto: CreateSaleDto): Promise<Sale> {
    const { storeID, paymentType, items } = createSaleDto;

    return this.dataSource.transaction(async (manager) => {
      // 1. Verificar tienda destino
      const targetStore = await manager.findOne(Store, {
        where: { storeID },
      });
      if (!targetStore) {
        throw new NotFoundException(`Tienda con ID ${storeID} no encontrada`);
      }

      const sale = manager.create(Sale, {
        store: { storeID },
        paymentType,
        status: 'Pendiente',
        total: 0,
      });
      const savedSale = await manager.save(sale);

      let total = 0;

      for (const item of items) {
        const { variationID, quantity, unitPrice } = item;
        const variation = await manager.findOne(ProductVariation, {
          where: { variationID },
        });

        if (!variation) {
          throw new NotFoundException(
            `Variación con ID ${variationID} no encontrada`,
          );
        }

        const subtotal = unitPrice * quantity;
        total += subtotal;
        const saleProduct = manager.create(SaleProduct, {
          sale: { saleID: savedSale.saleID },
          variation: { variationID: variation.variationID },
          unitPrice,
          subtotal,
          quantitySold: quantity,
        });
        await manager.save(saleProduct);

        const storeStock = await manager.findOne(StoreProduct, {
          where: {
            store: { storeID },
            variation: { variationID },
          },
          lock: { mode: 'pessimistic_write' },
        });

        if (!storeStock) {
          throw new BadRequestException(
            `El producto no está asociado a la tienda (VariationID: ${variationID})`,
          );
        }

        if (storeStock.stock < quantity) {
          throw new BadRequestException(
            `Stock insuficiente en tienda para VariationID: ${variationID}. Solicitado: ${quantity}, Disponible: ${storeStock.stock}`,
          );
        }

        const movement = manager.create(InventoryMovement, {
          store: { storeID },
          variation: { variationID: variation.variationID },
          delta: -quantity,
          reason: InventoryMovementReason.SALE,
          referenceID: savedSale.saleID,
        });
        await manager.save(movement);

        // StoreProduct remains a cache/read model; InventoryMovements is the source of truth.
        storeStock.stock -= quantity;
        await manager.save(storeStock);
      }

      savedSale.total = total;
      await manager.save(savedSale);

      return this.findOneInTransaction(manager, savedSale.saleID);
    });
  }

  findAll(): Promise<Sale[]> {
    return this.saleRepository.find({
      relations: ['store', 'saleProducts', 'saleProducts.variation'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Sale> {
    const sale = await this.saleRepository.findOne({
      where: { saleID: id },
      relations: ['store', 'saleProducts', 'saleProducts.variation'],
    });
    if (!sale) {
      throw new NotFoundException(`Venta con ID ${id} no encontrada`);
    }
    return sale;
  }

  async updateStatus(
    id: string,
    updateSaleStatusDto: UpdateSaleStatusDto,
  ): Promise<Sale> {
    const sale = await this.findOne(id);
    sale.status = updateSaleStatusDto.status;
    await this.saleRepository.save(sale);
    return this.findOne(id);
  }
}
