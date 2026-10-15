import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { TenantContextService } from '../multitenant/tenant-context.service';
import { StoreProduct } from '../relations/storeproduct/entities/storeproduct.entity';
import { SalesService } from '../sales/sales.service';
import { loadSale } from '../sales/sales-repository.helpers';
import { toSaleView } from '../sales/sales-view.mapper';
import { CommerceChannel } from './entities/commerce-channel.entity';
import { CommerceOrder } from './entities/commerce-order.entity';
import { CreateCommerceSaleDto } from './dto/create-commerce-sale.dto';
import {
  commerceIssueDate,
  commerceRequestHash,
} from './commerce-sales.engine';

export type CommerceBinding = {
  channelId: string;
  tenantId: string;
  storeId: string;
};

@Injectable()
export class CommerceSalesService {
  constructor(
    private readonly context: TenantContextService,
    private readonly sales: SalesService,
  ) {}

  private assertTenant(binding: CommerceBinding) {
    if (binding.tenantId !== this.context.getTenantId())
      throw new ForbiddenException('Contexto de canal invalido');
  }

  private async view(manager: EntityManager, order: CommerceOrder) {
    return {
      commerceOrderID: order.commerceOrderID,
      externalOrderID: order.externalOrderID,
      tenantID: order.tenantID,
      storeID: order.storeID,
      channelID: order.channelID,
      saleID: order.saleID,
      payment: {
        provider: order.paymentProvider,
        reference: order.paymentReference,
        status: 'approved',
        amount: Number(order.amount),
        currency: order.currency,
        paidAt: order.paidAt,
        isTest: order.isTest,
      },
      customerDetails: order.customerDetails,
      ...toSaleView(await loadSale(manager, order.saleID, order.storeID)),
    };
  }

  async find(binding: CommerceBinding, externalOrderID: string) {
    this.assertTenant(binding);
    return this.context.transaction(async (manager) => {
      const order = await manager.getRepository(CommerceOrder).findOne({
        where: {
          tenantID: binding.tenantId,
          channelID: binding.channelId,
          storeID: binding.storeId,
          externalOrderID,
        },
      });
      if (!order)
        throw new NotFoundException(
          'Pedido no encontrado en este canal y tienda',
        );
      return this.view(manager, order);
    });
  }

  async confirm(binding: CommerceBinding, dto: CreateCommerceSaleDto) {
    this.assertTenant(binding);
    const requestHash = commerceRequestHash(dto);
    return this.context.transaction(async (manager) => {
      const channel = await manager.getRepository(CommerceChannel).findOne({
        where: {
          channelID: binding.channelId,
          tenantID: binding.tenantId,
          storeID: binding.storeId,
          active: true,
        },
        lock: { mode: 'pessimistic_read' },
      });
      if (!channel?.salesEnabled)
        throw new ForbiddenException(
          'El canal no esta habilitado para registrar ventas',
        );
      if (dto.payment.isTest && !channel.acceptTestPayments)
        throw new ForbiddenException('Este canal no acepta ventas de prueba');

      // Transaction-scoped locks serialize both a repeated order and a reused payment.
      const keys = [
        'commerce-order:' +
          binding.tenantId +
          ':' +
          binding.channelId +
          ':' +
          dto.externalOrderID,
        'commerce-payment:' +
          binding.tenantId +
          ':' +
          dto.payment.provider +
          ':' +
          dto.payment.reference,
      ].sort();
      for (const key of keys)
        await manager.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
          [key],
        );
      const repository = manager.getRepository(CommerceOrder);
      const existing = await repository.findOne({
        where: {
          tenantID: binding.tenantId,
          channelID: binding.channelId,
          externalOrderID: dto.externalOrderID,
        },
      });
      if (existing) {
        if (
          existing.storeID !== binding.storeId ||
          existing.requestHash !== requestHash
        ) {
          throw new ConflictException(
            'El pedido ya fue registrado con otros datos',
          );
        }
        return this.view(manager, existing);
      }
      const usedPayment = await repository.findOne({
        where: {
          tenantID: binding.tenantId,
          paymentProvider: dto.payment.provider,
          paymentReference: dto.payment.reference,
        },
      });
      if (usedPayment)
        throw new ConflictException('El pago ya fue utilizado en otro pedido');

      const ids = dto.items.map((item) => item.storeProductID);
      const products = await manager
        .getRepository(StoreProduct)
        .createQueryBuilder('product')
        .where('product."tenantID" = :tenantID', { tenantID: binding.tenantId })
        .andWhere('product."storeID" = :storeID', { storeID: binding.storeId })
        .andWhere('product."storeProductID" IN (:...ids)', { ids })
        .orderBy('product."storeProductID"', 'ASC')
        .setLock('pessimistic_write')
        .getMany();
      if (products.length !== ids.length)
        throw new NotFoundException('Producto fuera de la tienda del canal');
      const byID = new Map(
        products.map((product) => [
          product.storeProductID.toLowerCase(),
          product,
        ]),
      );
      if (
        dto.items.some(
          (item) =>
            Number(byID.get(item.storeProductID.toLowerCase())?.stock ?? 0) <
            item.quantity,
        )
      ) {
        throw new ConflictException(
          'Stock insuficiente para registrar el pedido pagado',
        );
      }

      const result = await this.sales.createCommerceSale(
        manager,
        binding.storeId,
        {
          items: dto.items,
          receiver: {
            ...dto.receiver,
            address: dto.receiver.address ?? dto.shipping?.street,
            city: dto.receiver.city ?? dto.shipping?.comuna,
          },
          issueDate: commerceIssueDate(
            dto.payment.paidAt,
            this.context.getTimeZone(),
          ),
        },
        'commerce:' + requestHash + ':' + binding.channelId,
        dto.payment.amount,
      );
      const order = await repository.save(
        repository.create({
          tenantID: binding.tenantId,
          storeID: binding.storeId,
          channelID: binding.channelId,
          externalOrderID: dto.externalOrderID,
          saleID: result.sale.saleID,
          requestHash,
          paymentProvider: dto.payment.provider,
          paymentReference: dto.payment.reference,
          amount: dto.payment.amount,
          currency: dto.payment.currency,
          paidAt: new Date(dto.payment.paidAt),
          isTest: dto.payment.isTest,
          customerDetails: {
            phone: dto.phone ?? null,
            shipping: dto.shipping ?? null,
            notes: dto.notes ?? null,
          },
        }),
      );
      return this.view(manager, order);
    });
  }
}
