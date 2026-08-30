import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { PurchaseOrder } from './entities/purchase-order.entity';
import { PurchaseOrderItem } from './entities/purchase-order-item.entity';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { UpdatePurchaseOrderDto } from './dto/update-purchase-order.dto';
import { UpdatePurchaseOrderStatusDto } from './dto/update-purchase-order-status.dto';
import { VerifyPurchaseOrderDto } from './dto/verify-purchase-order.dto';
import {
  PurchaseOrderCommercialStatus,
  PurchaseOrderPaymentStatus,
} from './entities/purchase-order.entity';
import { TenantContextService } from '../multitenant/tenant-context.service';
import { FinancialMovementsService } from '../financial-movements/financial-movements.service';
import { TransactionRunnerService } from '../common/services/transaction-runner.service';
import {
  applyStockForOrder,
  createPurchaseOrderEntity,
  createPurchaseOrderItemEntity,
  findPurchaseOrderForUpdate,
  findPurchaseOrderItems,
  findStoreById,
  findVariationById,
} from './purchase-orders-repository.helpers';
import {
  buildVerificationPlan,
  calculateTotals,
  createPurchaseOrderFolio,
  ensureCommercialStatusTransition,
  toMoney,
} from './purchase-orders-engine';

@Injectable()
export class PurchaseOrdersService {
  constructor(
    @InjectRepository(PurchaseOrder)
    private readonly purchaseOrderRepository: Repository<PurchaseOrder>,
    private readonly dataSource: DataSource,
    private readonly financialMovementsService: FinancialMovementsService,
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

  async create(dto: CreatePurchaseOrderDto): Promise<PurchaseOrder> {
    const discount = dto.discount ?? 0;
    const isThirdParty = dto.isThirdParty ?? false;
    const dueDate = dto.dueDate ? new Date(dto.dueDate) : null;

    return this.runInTransaction(async (manager) => {
      await findStoreById(manager, dto.storeID);

      const purchaseOrder = createPurchaseOrderEntity(manager, {
        storeID: dto.storeID,
        folio: createPurchaseOrderFolio(),
        isThirdParty,
        issueDate: new Date(),
        dueDate,
        paymentStatus: PurchaseOrderPaymentStatus.PENDIENTE,
        status: PurchaseOrderCommercialStatus.PENDIENTE,
        discount,
      });

      const savedOrder = await manager.save(purchaseOrder);

      const itemsToSave: PurchaseOrderItem[] = [];
      for (const itemDto of dto.items) {
        await findVariationById(manager, itemDto.variationID);
        itemsToSave.push(
          createPurchaseOrderItemEntity(manager, {
            purchaseOrderID: savedOrder.purchaseOrderID,
            variationID: itemDto.variationID,
            unitPrice: itemDto.unitPrice,
            quantityRequested: itemDto.quantity,
          }),
        );
      }

      await manager.save(itemsToSave);

      const totals = calculateTotals(itemsToSave, discount);
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
        throw new NotFoundException(
          `Orden de compra con ID ${id} no encontrada`,
        );
      }

      return purchaseOrder;
    });
  }

  async update(
    id: string,
    dto: UpdatePurchaseOrderDto,
  ): Promise<PurchaseOrder> {
    return this.runInTransaction(async (manager) => {
      const purchaseOrder = await findPurchaseOrderForUpdate(manager, id);
      purchaseOrder.items = await findPurchaseOrderItems(manager, id);

      if (dto.storeID) {
        purchaseOrder.store = await findStoreById(manager, dto.storeID);
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
        const existingItems = await findPurchaseOrderItems(manager, id);
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
            existing.subtotal = toMoney(itemDto.unitPrice * itemDto.quantity);
            updatedItems.push(existing);
            itemsMap.delete(itemDto.variationID);
          } else {
            updatedItems.push(
              createPurchaseOrderItemEntity(manager, {
                purchaseOrderID: id,
                variationID: itemDto.variationID,
                unitPrice: itemDto.unitPrice,
                quantityRequested: itemDto.quantity,
              }),
            );
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
            await applyStockForOrder(
              manager,
              purchaseOrder,
              1,
              this.tenantContext,
            );
            purchaseOrder.paidAt = new Date();
          }

          if (
            previousStatus === PurchaseOrderPaymentStatus.PAGADO &&
            (nextStatus === PurchaseOrderPaymentStatus.PENDIENTE ||
              nextStatus === PurchaseOrderPaymentStatus.ANULADO)
          ) {
            await applyStockForOrder(
              manager,
              purchaseOrder,
              -1,
              this.tenantContext,
            );
            purchaseOrder.paidAt = null;
            await this.financialMovementsService.removePurchaseOrder(
              manager,
              purchaseOrder.purchaseOrderID,
            );
          }
        }

        purchaseOrder.paymentStatus = nextStatus;
      }

      const totals = calculateTotals(
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

      if (purchaseOrder.paymentStatus === PurchaseOrderPaymentStatus.PAGADO) {
        await this.financialMovementsService.recordPurchaseOrder(
          manager,
          purchaseOrder,
          purchaseOrder.paidAt ?? purchaseOrder.issueDate,
        );
      }

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
      const purchaseOrder = await findPurchaseOrderForUpdate(manager, id);
      const previousStatus = purchaseOrder.status;
      const nextStatus = dto.status;

      if (previousStatus === nextStatus) {
        return this.findOne(id);
      }

      ensureCommercialStatusTransition(previousStatus, nextStatus);

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
      const purchaseOrder = await findPurchaseOrderForUpdate(manager, id);
      const items = await findPurchaseOrderItems(manager, id);

      const plan = buildVerificationPlan({
        purchaseOrderID: id,
        items,
        scans: dto.items,
        discount: purchaseOrder.discount,
      });

      for (const planned of plan.items) {
        if (planned.kind === 'existing') {
          await manager.save(planned.item);
        } else {
          await manager.save(
            createPurchaseOrderItemEntity(manager, {
              purchaseOrderID: id,
              variationID: planned.values.variationID,
              unitPrice: planned.values.unitPrice,
              quantityRequested: planned.values.quantityRequested,
              quantityReceived: planned.values.quantityReceived,
            }),
          );
        }
      }

      purchaseOrder.subtotal = plan.totals.subtotal;
      purchaseOrder.netTotal = plan.totals.net;
      purchaseOrder.tax = plan.totals.tax;
      purchaseOrder.total = plan.totals.total;
      purchaseOrder.totalProducts =
        items.reduce((acc, item) => acc + item.quantityRequested, 0) +
        plan.items.reduce(
          (acc, planned) =>
            planned.kind === 'new'
              ? acc + planned.values.quantityRequested
              : acc,
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

      if (order.paymentStatus === PurchaseOrderPaymentStatus.PAGADO) {
        await this.financialMovementsService.recordPurchaseOrder(
          manager,
          order,
          order.paidAt ?? order.issueDate,
        );
      }

      return { summary: plan.summary, order };
    });
  }
}
