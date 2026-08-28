import { NotFoundException } from '@nestjs/common';
import { EntityManager, In } from 'typeorm';
import { isUniqueViolation } from '../common/utils/db-errors.util';
import { Sale } from '../sales/entities/sale.entity';
import { Return, ReturnStatus } from './entities/return.entity';
import { ReturnItem } from './entities/return-item.entity';
import { ReturnFolioCounter } from './entities/return-folio-counter.entity';
import { ListReturnsQueryDto } from './dto/list-returns.query.dto';
import {
  activeReturnStatuses,
  PreparedReturn,
  PreparedReturnItem,
} from './returns-engine';
import { applyOwnershipScope } from '../common/authorization/apply-ownership-scope';
import { PermissionScope } from '../roles/entities/role-permission.entity';

type Ownership = { scope: PermissionScope; ownerId: string };

export async function findSaleForReturn(
  manager: EntityManager,
  saleID: string,
  storeID: string,
): Promise<Sale> {
  const sale = await manager.getRepository(Sale).findOne({
    where: { saleID, store: { storeID } },
    relations: ['items', 'store', 'dteDocument'],
  });
  if (!sale) {
    throw new NotFoundException(`Venta con ID ${saleID} no encontrada`);
  }
  return sale;
}

export async function findReturnByIdempotencyKey(
  manager: EntityManager,
  idempotencyKey: string,
): Promise<Return | null> {
  return manager.getRepository(Return).findOne({
    where: { idempotencyKey },
  });
}

export async function loadReturn(
  manager: EntityManager,
  returnID: string,
  storeID?: string,
  ownership?: Ownership,
): Promise<Return> {
  if (!ownership) {
    const where = storeID ? { returnID, store: { storeID } } : { returnID };
    const ret = await manager.getRepository(Return).findOne({
      where,
      relations: [
        'items',
        'sale',
        'sale.items',
        'sale.store',
        'sale.dteDocument',
        'dteDocument',
        'store',
      ],
    });
    if (!ret)
      throw new NotFoundException(
        `Devolución con ID ${returnID} no encontrada`,
      );
    return ret;
  }
  const qb = manager
    .getRepository(Return)
    .createQueryBuilder('ret')
    .leftJoinAndSelect('ret.items', 'items')
    .leftJoinAndSelect('ret.sale', 'sale')
    .leftJoinAndSelect('ret.dteDocument', 'dteDocument')
    .leftJoinAndSelect('ret.store', 'store')
    .where('ret.returnID = :returnID', { returnID });
  if (storeID) qb.andWhere('ret.storeID = :storeID', { storeID });
  if (ownership)
    applyOwnershipScope(qb, 'ret', ownership.scope, ownership.ownerId);
  const ret = await qb.getOne();
  if (!ret) {
    throw new NotFoundException(`Devolución con ID ${returnID} no encontrada`);
  }
  return ret;
}

export async function loadReturnForUpdate(
  manager: EntityManager,
  returnID: string,
  storeID?: string,
): Promise<Return> {
  const where = storeID ? { returnID, store: { storeID } } : { returnID };
  const locked = await manager.getRepository(Return).findOne({
    where,
    lock: { mode: 'pessimistic_write' },
  });
  if (!locked) {
    throw new NotFoundException(`Devolución con ID ${returnID} no encontrada`);
  }

  // Las relaciones se cargan después del lock para no generar outer joins
  // bloqueados (mismo patrón que findSaleForConversion).
  const full = await manager.getRepository(Return).findOne({
    where: { returnID },
    relations: [
      'items',
      'sale',
      'sale.items',
      'sale.store',
      'sale.dteDocument',
      'dteDocument',
      'store',
    ],
  });
  return full ?? locked;
}

export async function findActiveReturnsForSale(
  manager: EntityManager,
  saleID: string,
): Promise<Return[]> {
  return manager.getRepository(Return).find({
    where: {
      saleID,
      status: In(activeReturnStatuses()),
    },
    relations: ['items'],
  });
}

export async function listReturns(
  manager: EntityManager,
  storeID: string,
  query: ListReturnsQueryDto,
  ownership?: Ownership,
): Promise<{ returns: Return[]; total: number }> {
  const page = query.page ?? 1;
  const limit = query.limit ?? 50;

  const qb = manager
    .getRepository(Return)
    .createQueryBuilder('ret')
    .leftJoinAndSelect('ret.items', 'items')
    .leftJoinAndSelect('ret.sale', 'sale')
    .leftJoinAndSelect('ret.dteDocument', 'dteDocument')
    .where('ret.storeID = :storeID', { storeID });
  if (ownership)
    applyOwnershipScope(qb, 'ret', ownership.scope, ownership.ownerId);

  if (query.saleID)
    qb.andWhere('ret.saleID = :saleID', { saleID: query.saleID });
  if (query.status)
    qb.andWhere('ret.status = :status', { status: query.status });
  if (query.returnType) {
    qb.andWhere('ret.returnType = :returnType', {
      returnType: query.returnType,
    });
  }

  const [returns, total] = await qb
    .orderBy('ret.createdAt', 'DESC')
    .skip((page - 1) * limit)
    .take(limit)
    .getManyAndCount();

  return { returns, total };
}

export async function nextReturnFolio(
  manager: EntityManager,
  storeID: string,
  tenantID: string | undefined,
): Promise<number> {
  let counter = await manager.findOne(ReturnFolioCounter, {
    where: { storeID },
    lock: { mode: 'pessimistic_write' },
  });

  if (!counter) {
    try {
      counter = await manager.save(
        manager.create(ReturnFolioCounter, {
          tenantID,
          storeID,
          currentFolio: 0,
        }),
      );
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      counter = await manager.findOne(ReturnFolioCounter, {
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

export function createReturnEntity(
  manager: EntityManager,
  input: {
    returnID: string;
    tenantID: string | undefined;
    storeID: string;
    saleID: string;
    userID: string;
    impersonatedBy?: string | null;
    prepared: PreparedReturn;
    idempotencyKey: string | null;
  },
): Return {
  return manager.create(Return, {
    returnID: input.returnID,
    tenantID: input.tenantID,
    store: { storeID: input.storeID },
    sale: { saleID: input.saleID },
    userID: input.userID,
    impersonatedBy: input.impersonatedBy ?? null,
    returnType: input.prepared.returnType,
    status: ReturnStatus.PENDIENTE,
    reason: input.prepared.reason,
    discountAmount: input.prepared.discountAmount,
    issueDate: input.prepared.issueDate,
    subtotal: input.prepared.subtotal,
    netTotal: input.prepared.netTotal,
    taxTotal: input.prepared.taxTotal,
    total: input.prepared.total,
    cogsTotal: input.prepared.cogsTotal,
    idempotencyKey: input.idempotencyKey,
  });
}

export function createReturnItems(
  manager: EntityManager,
  tenantID: string | undefined,
  returnID: string,
  items: PreparedReturnItem[],
): ReturnItem[] {
  return items.map((item) =>
    manager.create(ReturnItem, {
      tenantID,
      ret: { returnID },
      saleItemID: item.saleItemID,
      storeProductID: item.storeProductID,
      variationID: item.variationID,
      productName: item.productName,
      sku: item.sku,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      unitCost: item.unitCost,
      lineTotal: item.lineTotal,
      condition: item.condition,
    }),
  );
}
