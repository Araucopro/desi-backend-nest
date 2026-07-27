import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { PurchaseOrder } from './entities/purchase-order.entity';
import { PurchaseOrderItem } from './entities/purchase-order-item.entity';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { UpdatePurchaseOrderDto } from './dto/update-purchase-order.dto';
import { UpdatePurchaseOrderStatusDto } from './dto/update-purchase-order-status.dto';
import { VerifyPurchaseOrderDto } from './dto/verify-purchase-order.dto';
import { Store } from '../stores/entities/store.entity';
import { ProductVariation } from '../products/entities/product-variation.entity';
import { StoreProduct } from '../relations/storeproduct/entities/storeproduct.entity';
import {
  PurchaseOrderCommercialStatus,
  PurchaseOrderPaymentStatus,
} from './entities/purchase-order.entity';
import { TenantContextService } from '../multitenant/tenant-context.service';

const TAX_RATE = 0.19;

@Injectable()
export class PurchaseOrdersService {
  constructor(
    @InjectRepository(PurchaseOrder)
    private readonly purchaseOrderRepository: Repository<PurchaseOrder>,
    private readonly dataSource: DataSource,
    @Optional() private readonly tenantContext?: TenantContextService,
  ) {}

  private runInTransaction<T>(callback: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.tenantContext
      ? this.tenantContext.transaction(callback)
      : this.dataSource.transaction(callback);
  }


  private toMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private calculateTotals(items: PurchaseOrderItem[], discount: number) {
    const subtotal = this.toMoney(
      items.reduce((acc, item) => acc + item.subtotal, 0),
    );
    const net = this.toMoney(Math.max(subtotal - discount, 0));
    const tax = this.toMoney(net * TAX_RATE);
    const total = this.toMoney(net + tax);

    return { subtotal, net, tax, total };
  }

  private ensureCommercialStatusTransition(
    currentStatus: PurchaseOrderCommercialStatus,
    nextStatus: PurchaseOrderCommercialStatus,
  ) {
    if (currentStatus === nextStatus) {
      return;
    }

    const allowedTransitions: Record<
      PurchaseOrderCommercialStatus,
      PurchaseOrderCommercialStatus[]
    > = {
      [PurchaseOrderCommercialStatus.PENDIENTE]: [
        PurchaseOrderCommercialStatus.ENVIADO,
        PurchaseOrderCommercialStatus.RECHAZADO,
      ],
      [PurchaseOrderCommercialStatus.ENVIADO]: [
        PurchaseOrderCommercialStatus.ACEPTADO,
        PurchaseOrderCommercialStatus.RECHAZADO,
      ],
      [PurchaseOrderCommercialStatus.ACEPTADO]: [],
      [PurchaseOrderCommercialStatus.RECHAZADO]: [],
    };

    if (!allowedTransitions[currentStatus].includes(nextStatus)) {
      throw new BadRequestException(
        `No se puede cambiar el estado de ${currentStatus} a ${nextStatus}`,
      );
    }
  }

  // direction: +1 aplica stock (central -> tienda), -1 revierte
  private async applyStockForOrder(
    manager: EntityManager,
    order: PurchaseOrder,
    direction: 1 | -1,
  ) {
    const sign = direction === 1 ? 1 : -1;

    for (const item of order.items) {
      const quantity = item.quantityRequested || 0;
      if (quantity <= 0) continue;

      const variation = await manager.findOne(ProductVariation, {
        where: { variationID: item.variation.variationID },
        lock: { mode: 'pessimistic_write' },
      });

      if (!variation) {
        throw new NotFoundException(
          `Variación con ID ${item.variation.variationID} no encontrada`,
        );
      }

      // mover stock en tienda
      const priceCost = item.unitPrice;
      await this.upsertStoreStock(
        manager,
        order.store.storeID,
        item.variation.variationID,
        priceCost,
        sign * quantity,
      );
    }
  }

  private async upsertStoreStock(
    manager: EntityManager,
    storeID: string,
    variationID: string,
    priceCost: number,
    delta: number,
  ) {
    let storeStock = await manager.findOne(StoreProduct, {
      where: {
        store: { storeID },
        variation: { variationID },
      },
      lock: { mode: 'pessimistic_write' },
    });

    if (!storeStock) {
      storeStock = manager.create(StoreProduct, {
        store: { storeID },
        variation: { variationID },
        stock: 0,
        priceCost,
        priceList: 0, // default
      });
    }

    storeStock.priceCost = priceCost;
    storeStock.stock += delta;
    await manager.save(storeStock);
  }

  async create(dto: CreatePurchaseOrderDto): Promise<PurchaseOrder> {
    const discount = dto.discount ?? 0;
    const isThirdParty = dto.isThirdParty ?? false;
    const dueDate = dto.dueDate ? new Date(dto.dueDate) : null;

    return this.runInTransaction(async (manager) => {
      const store = await manager.findOne(Store, {
        where: { storeID: dto.storeID },
      });
      if (!store) {
        throw new NotFoundException(
          `Tienda con ID ${dto.storeID} no encontrada`,
        );
      }

      const folio = randomBytes(3).toString('hex');
      const purchaseOrder = manager.create(PurchaseOrder, {
        store: { storeID: dto.storeID },
        folio,
        isThirdParty,
        issueDate: new Date(),
        dueDate,
        paymentStatus: PurchaseOrderPaymentStatus.PENDIENTE,
        status: PurchaseOrderCommercialStatus.PENDIENTE,
        subtotal: 0,
        discount,
        netTotal: 0,
        tax: 0,
        total: 0,
        totalProducts: 0,
      });

      const savedOrder = await manager.save(purchaseOrder);

      const itemsToSave: PurchaseOrderItem[] = [];
      for (const itemDto of dto.items) {
        const variation = await manager.findOne(ProductVariation, {
          where: { variationID: itemDto.variationID },
        });
        if (!variation) {
          throw new NotFoundException(
            `Variación con ID ${itemDto.variationID} no encontrada`,
          );
        }

        const subtotal = this.toMoney(itemDto.unitPrice * itemDto.quantity);
        const purchaseOrderItem = manager.create(PurchaseOrderItem, {
          purchaseOrder: { purchaseOrderID: savedOrder.purchaseOrderID },
          variation: { variationID: itemDto.variationID },
          unitPrice: itemDto.unitPrice,
          subtotal,
          quantityRequested: itemDto.quantity,
          quantityReceived: 0,
        });
        itemsToSave.push(purchaseOrderItem);
      }

      await manager.save(itemsToSave);

      const totals = this.calculateTotals(itemsToSave, discount);
      savedOrder.subtotal = totals.subtotal;
      savedOrder.netTotal = totals.net;
      savedOrder.tax = totals.tax;
      savedOrder.total = totals.total;
      savedOrder.totalProducts = itemsToSave.reduce(
        (acc, item) => acc + item.quantityRequested,
        0,
      );

      await manager.save(savedOrder);

      const result = await manager.findOne(PurchaseOrder, {
        where: { purchaseOrderID: savedOrder.purchaseOrderID },
        relations: ['store', 'items', 'items.variation'],
      });

      if (!result) {
        throw new NotFoundException(
          `Orden de compra con ID ${savedOrder.purchaseOrderID} no encontrada`,
        );
      }

      return result;
    });
  }

  findAll(): Promise<PurchaseOrder[]> {
    return this.runInTransaction((manager) =>
      manager.getRepository(PurchaseOrder).find({
        relations: ['store', 'items', 'items.variation'],
        order: { createdAt: 'DESC' },
      }),
    );
  }

  async findOne(id: string): Promise<PurchaseOrder> {
    return this.runInTransaction(async (manager) => {
      const purchaseOrder = await manager.getRepository(PurchaseOrder).findOne({
        where: { purchaseOrderID: id },
        relations: ['store', 'items', 'items.variation'],
      });

      if (!purchaseOrder) {
        throw new NotFoundException(`Orden de compra con ID ${id} no encontrada`);
      }

      return purchaseOrder;
    });
  }

  async update(
    id: string,
    dto: UpdatePurchaseOrderDto,
  ): Promise<PurchaseOrder> {
    return this.runInTransaction(async (manager) => {
      const purchaseOrder = await manager.findOne(PurchaseOrder, {
        where: { purchaseOrderID: id },
        lock: { mode: 'pessimistic_write' },
        relations: ['store'],
      });

      if (!purchaseOrder) {
        throw new NotFoundException(
          `Orden de compra con ID ${id} no encontrada`,
        );
      }

      purchaseOrder.items = await manager.find(PurchaseOrderItem, {
        where: { purchaseOrder: { purchaseOrderID: id } },
        relations: ['variation'],
      });

      if (dto.storeID) {
        const store = await manager.findOne(Store, {
          where: { storeID: dto.storeID },
        });
        if (!store) {
          throw new NotFoundException(
            `Tienda con ID ${dto.storeID} no encontrada`,
          );
        }
        purchaseOrder.store = store;
      }

      if (dto.dueDate) {
        purchaseOrder.dueDate = new Date(dto.dueDate);
      }

      if (dto.isThirdParty !== undefined) {
        purchaseOrder.isThirdParty = dto.isThirdParty;
      }

      if (dto.discount !== undefined) {
        purchaseOrder.discount = dto.discount;
      }

      if (dto.items) {
        const existingItems = await manager.find(PurchaseOrderItem, {
          where: { purchaseOrder: { purchaseOrderID: id } },
          relations: ['variation'],
        });

        const itemsMap = new Map<string, PurchaseOrderItem>();
        existingItems.forEach((item) => {
          itemsMap.set(item.variation.variationID, item);
        });

        const updatedItems: PurchaseOrderItem[] = [];

        for (const itemDto of dto.items) {
          const existing = itemsMap.get(itemDto.variationID);

          if (existing) {
            existing.quantityRequested = itemDto.quantity;
            existing.unitPrice = itemDto.unitPrice;
            existing.subtotal = this.toMoney(
              itemDto.unitPrice * itemDto.quantity,
            );
            updatedItems.push(existing);
            itemsMap.delete(itemDto.variationID);
          } else {
            const newItem = manager.create(PurchaseOrderItem, {
              purchaseOrder: { purchaseOrderID: id },
              variation: { variationID: itemDto.variationID },
              unitPrice: itemDto.unitPrice,
              quantityRequested: itemDto.quantity,
              quantityReceived: 0,
              subtotal: this.toMoney(itemDto.unitPrice * itemDto.quantity),
            });
            updatedItems.push(newItem);
          }
        }

        if (itemsMap.size > 0) {
          await manager.remove(Array.from(itemsMap.values()));
        }

        purchaseOrder.items = await manager.save(updatedItems);
      }

      if (dto.paymentStatus) {
        const previousStatus = purchaseOrder.paymentStatus;
        const nextStatus = dto.paymentStatus;

        if (previousStatus !== nextStatus) {
          if (
            nextStatus === PurchaseOrderPaymentStatus.PAGADO &&
            (previousStatus === PurchaseOrderPaymentStatus.PENDIENTE ||
              previousStatus === PurchaseOrderPaymentStatus.ANULADO)
          ) {
            await this.applyStockForOrder(manager, purchaseOrder, 1);
          }

          if (
            previousStatus === PurchaseOrderPaymentStatus.PAGADO &&
            (nextStatus === PurchaseOrderPaymentStatus.PENDIENTE ||
              nextStatus === PurchaseOrderPaymentStatus.ANULADO)
          ) {
            await this.applyStockForOrder(manager, purchaseOrder, -1);
          }
        }

        purchaseOrder.paymentStatus = nextStatus;
      }

      const totals = this.calculateTotals(
        purchaseOrder.items,
        purchaseOrder.discount,
      );
      purchaseOrder.subtotal = totals.subtotal;
      purchaseOrder.netTotal = totals.net;
      purchaseOrder.tax = totals.tax;
      purchaseOrder.total = totals.total;
      purchaseOrder.totalProducts = purchaseOrder.items.reduce(
        (acc, item) => acc + item.quantityRequested,
        0,
      );

      await manager.save(purchaseOrder);
      const result = await manager.findOne(PurchaseOrder, {
        where: { purchaseOrderID: id },
        relations: ['store', 'items', 'items.variation'],
      });

      if (!result) {
        throw new NotFoundException(
          `Orden de compra con ID ${id} no encontrada`,
        );
      }

      return result;
    });
  }

  async updateStatus(
    id: string,
    dto: UpdatePurchaseOrderStatusDto,
  ): Promise<PurchaseOrder> {
    return this.runInTransaction(async (manager) => {
      const purchaseOrder = await manager.findOne(PurchaseOrder, {
        where: { purchaseOrderID: id },
        lock: { mode: 'pessimistic_write' },
        relations: ['store'],
      });

      if (!purchaseOrder) {
        throw new NotFoundException(
          `Orden de compra con ID ${id} no encontrada`,
        );
      }

      const previousStatus = purchaseOrder.status;
      const nextStatus = dto.status;

      if (previousStatus === nextStatus) {
        return this.findOne(id);
      }

      this.ensureCommercialStatusTransition(previousStatus, nextStatus);

      purchaseOrder.status = nextStatus;
      await manager.save(purchaseOrder);
      const result = await manager.findOne(PurchaseOrder, {
        where: { purchaseOrderID: id },
        relations: ['store', 'items', 'items.variation'],
      });

      if (!result) {
        throw new NotFoundException(
          `Orden de compra con ID ${id} no encontrada`,
        );
      }

      return result;
    });
  }

  async verify(
    id: string,
    dto: VerifyPurchaseOrderDto,
  ): Promise<{ summary: Record<string, number>; order: PurchaseOrder }> {
    return this.runInTransaction(async (manager) => {
      const purchaseOrder = await manager.findOne(PurchaseOrder, {
        where: { purchaseOrderID: id },
        lock: { mode: 'pessimistic_write' },
      });

      if (!purchaseOrder) {
        throw new NotFoundException(
          `Orden de compra con ID ${id} no encontrada`,
        );
      }

      purchaseOrder.items = await manager.find(PurchaseOrderItem, {
        where: { purchaseOrder: { purchaseOrderID: id } },
        relations: ['variation'],
      });

      const itemsMap = new Map<string, PurchaseOrderItem>();
      for (const item of purchaseOrder.items) {
        itemsMap.set(item.variation.variationID, item);
      }

      const scannedVariations = new Set<string>();
      const summary = {
        completos: 0,
        faltantes: 0,
        deMas: 0,
        noEsperados: 0,
      };

      for (const scan of dto.items) {
        scannedVariations.add(scan.variationID);

        const existing = itemsMap.get(scan.variationID);
        const received = scan.quantityReceived;
        const unitPrice = scan.unitPrice ?? existing?.unitPrice ?? 0;

        if (existing) {
          const diff = received - existing.quantityRequested;
          if (diff === 0) summary.completos += 1;
          if (diff > 0) summary.deMas += diff;
          if (diff < 0) summary.faltantes += Math.abs(diff);

          const previousReceived = existing.quantityReceived ?? 0;
          const delta = received - previousReceived;
          if (delta < 0) {
            throw new BadRequestException(
              'No se puede reducir la cantidad ya recibida en la verificación',
            );
          }

          existing.quantityReceived = received;
          if (received > existing.quantityRequested) {
            existing.quantityRequested = received;
          }
          existing.unitPrice = unitPrice;
          existing.subtotal = this.toMoney(
            existing.unitPrice * existing.quantityRequested,
          );
          await manager.save(existing);
        } else {
          summary.noEsperados += received;

          const newItem = manager.create(PurchaseOrderItem, {
            purchaseOrderID: purchaseOrder.purchaseOrderID,
            variationID: scan.variationID,
            unitPrice,
            quantityRequested: received,
            quantityReceived: received,
            subtotal: this.toMoney(unitPrice * received),
          });
          const saved = await manager.save(newItem);
          itemsMap.set(scan.variationID, saved);
        }
      }

      for (const item of itemsMap.values()) {
        if (!scannedVariations.has(item.variation.variationID)) {
          const missing = item.quantityRequested - (item.quantityReceived ?? 0);
          if (missing > 0) {
            summary.faltantes += missing;
          }
        }
      }

      const items = Array.from(itemsMap.values());
      const totals = this.calculateTotals(items, purchaseOrder.discount);
      purchaseOrder.subtotal = totals.subtotal;
      purchaseOrder.netTotal = totals.net;
      purchaseOrder.tax = totals.tax;
      purchaseOrder.total = totals.total;
      purchaseOrder.totalProducts = items.reduce(
        (acc, item) => acc + item.quantityRequested,
        0,
      );

      await manager.save(purchaseOrder);

      const order = await manager.findOne(PurchaseOrder, {
        where: { purchaseOrderID: id },
        relations: ['store', 'items', 'items.variation'],
      });
      if (!order) {
        throw new NotFoundException(
          `Orden de compra con ID ${id} no encontrada`,
        );
      }
      return { summary, order };
    });
  }
}

