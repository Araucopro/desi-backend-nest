import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager } from 'typeorm';
import {
  CommerceSalesService,
  CommerceBinding,
} from './commerce-sales.service';
import { CommerceChannel } from './entities/commerce-channel.entity';
import { CommerceOrder } from './entities/commerce-order.entity';
import { StoreProduct } from '../relations/storeproduct/entities/storeproduct.entity';
import { Sale } from '../sales/entities/sale.entity';
import { Payment } from '../cash-registers/entities/payment.entity';
import { CreateCommerceSaleDto } from './dto/create-commerce-sale.dto';
import {
  commerceIssueDate,
  commerceRequestHash,
} from './commerce-sales.engine';

const binding: CommerceBinding = {
  tenantId: 'tenant-1',
  storeId: 'store-1',
  channelId: 'channel-1',
};
function input(): CreateCommerceSaleDto {
  return {
    externalOrderID: 'web-order-1',
    items: [{ storeProductID: 'product-1', quantity: 1 }],
    receiver: {
      name: 'Cliente Web',
      email: 'cliente@example.test',
      address: 'Calle 123',
      city: 'Temuco',
    },
    phone: '+56912345678',
    shipping: { street: 'Calle 123', comuna: 'Temuco', region: 'Araucania' },
    notes: 'Despachar por la tarde',
    payment: {
      provider: 'mercadopago',
      reference: 'payment-1',
      amount: 1190,
      currency: 'CLP',
      status: 'approved',
      isTest: false,
      paidAt: '2026-10-15T15:00:00Z',
    },
  };
}
function setup() {
  const orders: CommerceOrder[] = [];
  const channel = { salesEnabled: true, acceptTestPayments: false };
  const products = [{ storeProductID: 'product-1', stock: 2 }];
  const orderRepository = {
    findOne: jest.fn(
      async ({ where }: { where: Record<string, unknown> }) =>
        orders.find((row) =>
          Object.entries(where).every(
            ([key, value]) =>
              (row as unknown as Record<string, unknown>)[key] === value,
          ),
        ) ?? null,
    ),
    create: jest.fn((value) => ({ ...value, commerceOrderID: 'commerce-1' })),
    save: jest.fn(async (value) => {
      orders.push(value as CommerceOrder);
      return value as CommerceOrder;
    }),
  };
  const builder = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    setLock: jest.fn().mockReturnThis(),
    getMany: jest.fn(async () => products),
  };
  const manager = {
    query: jest.fn().mockResolvedValue([]),
    getRepository: jest.fn((entity: unknown) => {
      if (entity === CommerceOrder) return orderRepository;
      if (entity === CommerceChannel)
        return { findOne: jest.fn(async () => channel) };
      if (entity === StoreProduct)
        return { createQueryBuilder: jest.fn(() => builder) };
      if (entity === Sale)
        return {
          findOne: jest.fn(async () => ({
            saleID: 'sale-1',
            storeID: 'store-1',
          })),
        };
      if (entity === Payment) return { find: jest.fn(async () => []) };
      throw new Error('Unexpected repository');
    }),
  };
  const context = {
    getTenantId: () => 'tenant-1',
    getTimeZone: () => 'America/Santiago',
    transaction: jest.fn(async (callback: (m: unknown) => Promise<unknown>) =>
      callback(manager),
    ),
  };
  const sales = {
    createCommerceSale: jest
      .fn()
      .mockResolvedValue({ sale: { saleID: 'sale-1' } }),
  };
  const service = new CommerceSalesService(context as never, sales as never);
  return {
    service,
    manager,
    orders,
    channel,
    products,
    builder,
    orderRepository,
    sales,
    context,
  };
}

describe('CommerceSalesService paid confirmations', () => {
  it('scopes products to the channel and preserves buyer, payment and shipping data', async () => {
    const ctx = setup();
    const dto = input();
    const result = await ctx.service.confirm(binding, dto);
    expect(ctx.builder.where).toHaveBeenCalledWith(
      'product."tenantID" = :tenantID',
      { tenantID: binding.tenantId },
    );
    expect(ctx.builder.andWhere).toHaveBeenCalledWith(
      'product."storeID" = :storeID',
      { storeID: binding.storeId },
    );
    expect(ctx.builder.setLock).toHaveBeenCalledWith('pessimistic_write');
    expect(ctx.manager.query).toHaveBeenCalledTimes(2);
    expect(ctx.sales.createCommerceSale).toHaveBeenCalledWith(
      ctx.manager,
      binding.storeId,
      { items: dto.items, receiver: dto.receiver, issueDate: '2026-10-15' },
      expect.any(String),
      1190,
    );
    expect(result.payment).toMatchObject({
      provider: 'mercadopago',
      reference: 'payment-1',
      amount: 1190,
    });
    expect(result.customerDetails).toEqual({
      phone: dto.phone,
      shipping: dto.shipping,
      notes: dto.notes,
    });
    expect(ctx.orders[0]).toMatchObject({
      tenantID: 'tenant-1',
      storeID: 'store-1',
      channelID: 'channel-1',
      saleID: 'sale-1',
    });
  });

  it('maps checkout shipping into the sale receiver when the receiver has only name and email', async () => {
    const ctx = setup();
    const dto = input();
    dto.receiver = { name: 'Cliente Web', email: 'cliente@example.test' };
    await ctx.service.confirm(binding, dto);
    expect(ctx.sales.createCommerceSale).toHaveBeenCalledWith(
      ctx.manager,
      binding.storeId,
      expect.objectContaining({
        receiver: {
          ...dto.receiver,
          address: dto.shipping!.street,
          city: dto.shipping!.comuna,
        },
      }),
      expect.any(String),
      1190,
    );
  });

  it('returns the same sale on retries and rejects a changed payload', async () => {
    const ctx = setup();
    const dto = input();
    await ctx.service.confirm(binding, dto);
    const result = await ctx.service.confirm(binding, dto);
    expect(result.saleID).toBe('sale-1');
    expect(ctx.sales.createCommerceSale).toHaveBeenCalledTimes(1);
    expect(ctx.orders).toHaveLength(1);
    await expect(
      ctx.service.confirm(binding, {
        ...dto,
        receiver: { ...dto.receiver, name: 'Otro cliente' },
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(ctx.orders).toHaveLength(1);
  });

  it('rejects a payment reused for a different order', async () => {
    const ctx = setup();
    await ctx.service.confirm(binding, input());
    await expect(
      ctx.service.confirm(binding, {
        ...input(),
        externalOrderID: 'other-order',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(ctx.sales.createCommerceSale).toHaveBeenCalledTimes(1);
  });

  it('keeps disabled channels and test payments from changing sales', async () => {
    const ctx = setup();
    ctx.channel.salesEnabled = false;
    await expect(ctx.service.confirm(binding, input())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    ctx.channel.salesEnabled = true;
    await expect(
      ctx.service.confirm(binding, {
        ...input(),
        payment: { ...input().payment, isTest: true },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(ctx.sales.createCommerceSale).not.toHaveBeenCalled();
    ctx.channel.acceptTestPayments = true;
    await expect(
      ctx.service.confirm(binding, {
        ...input(),
        payment: { ...input().payment, isTest: true },
      }),
    ).resolves.toMatchObject({ saleID: 'sale-1' });
  });

  it('rejects tenant mismatch, foreign products and insufficient stock', async () => {
    const ctx = setup();
    await expect(
      ctx.service.confirm({ ...binding, tenantId: 'other-tenant' }, input()),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(ctx.context.transaction).not.toHaveBeenCalled();
    ctx.products.length = 0;
    await expect(ctx.service.confirm(binding, input())).rejects.toBeInstanceOf(
      NotFoundException,
    );
    ctx.products.push({ storeProductID: 'product-1', stock: 0 });
    await expect(ctx.service.confirm(binding, input())).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(ctx.sales.createCommerceSale).not.toHaveBeenCalled();
  });

  it('does not save the payment record when sale creation fails', async () => {
    const ctx = setup();
    ctx.sales.createCommerceSale.mockRejectedValue(
      new ConflictException('Total mismatch'),
    );
    await expect(ctx.service.confirm(binding, input())).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(ctx.orderRepository.save).not.toHaveBeenCalled();
  });

  it('does not disclose orders from another channel or store', async () => {
    const ctx = setup();
    await ctx.service.confirm(binding, input());
    await expect(
      ctx.service.find({ ...binding, storeId: 'other-store' }, 'web-order-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      ctx.service.find(
        { ...binding, channelId: 'other-channel' },
        'web-order-1',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

it('uses canonical item ordering and the tenant date for a paid order', () => {
  const dto = input();
  dto.items.push({ storeProductID: 'product-2', quantity: 2 });
  expect(commerceRequestHash(dto)).toBe(
    commerceRequestHash({ ...dto, items: [...dto.items].reverse() }),
  );
  expect(commerceIssueDate('2026-10-16T01:00:00Z', 'America/Santiago')).toBe(
    '2026-10-15',
  );
});
