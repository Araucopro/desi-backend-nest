import { NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { isUniqueViolation } from '../common/utils/db-errors.util';
import { Store } from '../stores/entities/store.entity';
import { ListSalesQueryDto } from './dto/list-sales.query.dto';
import { SaleItem } from './entities/sale-item.entity';
import { Sale, SaleStatus } from './entities/sale.entity';
import { SaleFolioCounter } from './entities/sale-folio-counter.entity';
import { PreparedSale, PreparedSaleItem } from './sales.types';

export async function findStoreById(
  manager: EntityManager,
  storeID: string,
): Promise<Store> {
  const store = await manager.findOne(Store, {
    where: { storeID },
  });
  if (!store) {
    throw new NotFoundException(`Tienda con ID ${storeID} no encontrada`);
  }
  return store;
}

export async function findSaleByIdempotencyKey(
  manager: EntityManager,
  idempotencyKey: string,
): Promise<Sale | null> {
  return manager.getRepository(Sale).findOne({
    where: { idempotencyKey },
  });
}

export async function loadSale(
  manager: EntityManager,
  saleID: string,
  storeID?: string,
): Promise<Sale> {
  const sale = await manager.getRepository(Sale).findOne({
    where: storeID ? { saleID, store: { storeID } } : { saleID },
    relations: ['items', 'store', 'dteDocument'],
  });
  if (!sale) {
    throw new NotFoundException(`Venta con ID ${saleID} no encontrada`);
  }
  return sale;
}

export async function nextSaleFolio(
  manager: EntityManager,
  storeID: string,
  tenantID: string | undefined,
): Promise<number> {
  let counter = await manager.findOne(SaleFolioCounter, {
    where: { storeID },
    lock: { mode: 'pessimistic_write' },
  });

  if (!counter) {
    try {
      counter = await manager.save(
        manager.create(SaleFolioCounter, {
          tenantID,
          storeID,
          currentFolio: 0,
        }),
      );
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      counter = await manager.findOne(SaleFolioCounter, {
        where: { storeID },
        lock: { mode: 'pessimistic_write' },
      });
      if (!counter) throw error;
    }
  }

  counter.currentFolio += 1;
  await manager.save(counter);
  return counter.currentFolio;
}

export async function findSaleForConversion(
  manager: EntityManager,
  saleID: string,
  storeID: string,
): Promise<Sale | null> {
  return manager.getRepository(Sale).findOne({
    where: { saleID, store: { storeID } },
    lock: { mode: 'pessimistic_write' },
    relations: ['dteDocument'],
  });
}

export async function listSales(
  manager: EntityManager,
  storeID: string,
  query: ListSalesQueryDto,
): Promise<{ sales: Sale[]; total: number }> {
  const page = query.page ?? 1;
  const limit = query.limit ?? 50;

  const qb = manager
    .getRepository(Sale)
    .createQueryBuilder('sale')
    .leftJoinAndSelect('sale.items', 'items')
    .leftJoinAndSelect('sale.store', 'store')
    .leftJoinAndSelect('sale.dteDocument', 'dteDocument')
    .where('sale.storeID = :storeID', { storeID });

  if (query.saleType) {
    qb.andWhere('sale.saleType = :saleType', {
      saleType: query.saleType,
    });
  }
  if (query.status) {
    qb.andWhere('sale.status = :status', { status: query.status });
  }
  if (query.from) {
    qb.andWhere('sale.createdAt >= :from', { from: query.from });
  }
  if (query.to) {
    qb.andWhere('sale.createdAt < :to', { to: query.to });
  }

  const [sales, total] = await qb
    .orderBy('sale.createdAt', 'DESC')
    .skip((page - 1) * limit)
    .take(limit)
    .getManyAndCount();

  return { sales, total };
}

export type CreateSaleEntityInput = {
  saleID: string;
  tenantID: string | undefined;
  storeID: string;
  userID: string | null;
  saleType: PreparedSale['saleType'];
  status: SaleStatus;
  paymentType: PreparedSale['paymentType'];
  folio: number | null;
  issueDate: Date;
  receiver: PreparedSale['receiver'];
  subtotal: number;
  discount: number;
  netTotal: number;
  taxTotal: number;
  total: number;
  cogsTotal: number;
  dteDocumentID?: string | null;
  idempotencyKey: string | null;
};

export function createSaleEntity(
  manager: EntityManager,
  input: CreateSaleEntityInput,
): Sale {
  return manager.create(Sale, {
    saleID: input.saleID,
    tenantID: input.tenantID,
    store: { storeID: input.storeID },
    userID: input.userID,
    saleType: input.saleType,
    status: input.status,
    paymentType: input.paymentType,
    folio: input.folio,
    issueDate: input.issueDate,
    receiver: input.receiver,
    subtotal: input.subtotal,
    discount: input.discount,
    netTotal: input.netTotal,
    taxTotal: input.taxTotal,
    total: input.total,
    cogsTotal: input.cogsTotal,
    dteDocumentID: input.dteDocumentID ?? null,
    idempotencyKey: input.idempotencyKey,
  });
}

export function createSaleItems(
  manager: EntityManager,
  tenantID: string | undefined,
  saleID: string,
  items: PreparedSaleItem[],
): SaleItem[] {
  return items.map((item) =>
    manager.create(SaleItem, {
      tenantID,
      sale: { saleID },
      storeProductID: item.storeProductID,
      variationID: item.variationID,
      productName: item.productName,
      sku: item.sku,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      unitCost: item.unitCost,
      lineTotal: item.lineTotal,
    }),
  );
}
