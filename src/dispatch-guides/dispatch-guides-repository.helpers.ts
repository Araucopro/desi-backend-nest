import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EntityManager, In } from 'typeorm';
import { Store } from '../stores/entities/store.entity';
import { StoreProduct } from '../relations/storeproduct/entities/storeproduct.entity';
import {
  DispatchGuide,
  DispatchGuideStatus,
} from './entities/dispatch-guide.entity';
import { DispatchGuideItem } from './entities/dispatch-guide-item.entity';
import { DispatchGuideReferenceItem } from './entities/dispatch-guide-reference-item.entity';
import { ListDispatchGuidesQueryDto } from './dto/list-dispatch-guides.query.dto';
import { PreparedDispatchGuide } from './dispatch-guides-engine';
import { applyOwnershipScope } from '../common/authorization/apply-ownership-scope';
import { PermissionScope } from '../roles/entities/role-permission.entity';

type Ownership = { scope: PermissionScope; ownerId: string };

export const DISPATCH_GUIDE_LOAD_RELATIONS = [
  'items',
  'store',
  'dteDocument',
  'references',
  'references.dteDocument',
  'references.items',
] as const;

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

export async function findDispatchGuideByIdempotencyKey(
  manager: EntityManager,
  idempotencyKey: string,
): Promise<DispatchGuide | null> {
  return manager.getRepository(DispatchGuide).findOne({
    where: { idempotencyKey },
  });
}

export async function loadDispatchGuide(
  manager: EntityManager,
  dispatchGuideID: string,
  storeID?: string,
  ownership?: Ownership,
): Promise<DispatchGuide> {
  if (!ownership) {
    const guide = await manager.getRepository(DispatchGuide).findOne({
      where: storeID
        ? { dispatchGuideID, store: { storeID } }
        : { dispatchGuideID },
      relations: [...DISPATCH_GUIDE_LOAD_RELATIONS],
    });
    if (!guide) {
      throw new NotFoundException(
        `Guía de despacho con ID ${dispatchGuideID} no encontrada`,
      );
    }
    return guide;
  }
  const qb = manager
    .getRepository(DispatchGuide)
    .createQueryBuilder('guide')
    .leftJoinAndSelect('guide.items', 'items')
    .leftJoinAndSelect('guide.store', 'store')
    .leftJoinAndSelect('guide.dteDocument', 'dteDocument')
    .leftJoinAndSelect('guide.references', 'references')
    .leftJoinAndSelect('references.dteDocument', 'referenceDte')
    .leftJoinAndSelect('references.items', 'referenceItems')
    .where('guide.dispatchGuideID = :dispatchGuideID', { dispatchGuideID });
  if (storeID) qb.andWhere('guide.storeID = :storeID', { storeID });
  if (ownership)
    applyOwnershipScope(qb, 'guide', ownership.scope, ownership.ownerId);
  const guide = await qb.getOne();
  if (!guide) {
    throw new NotFoundException(
      `Guía de despacho con ID ${dispatchGuideID} no encontrada`,
    );
  }
  return guide;
}

export async function loadDispatchGuideForUpdate(
  manager: EntityManager,
  dispatchGuideID: string,
  storeID?: string,
): Promise<DispatchGuide> {
  const locked = await manager.getRepository(DispatchGuide).findOne({
    where: storeID
      ? { dispatchGuideID, store: { storeID } }
      : { dispatchGuideID },
    lock: { mode: 'pessimistic_write' },
  });
  if (!locked) {
    throw new NotFoundException(
      `Guía de despacho con ID ${dispatchGuideID} no encontrada`,
    );
  }

  const full = await manager.getRepository(DispatchGuide).findOne({
    where: { dispatchGuideID },
    relations: [...DISPATCH_GUIDE_LOAD_RELATIONS],
  });
  return full ?? locked;
}

export async function findEmittedDispatchGuides(
  manager: EntityManager,
  storeID: string,
  dispatchGuideIDs: string[],
): Promise<DispatchGuide[]> {
  return manager.getRepository(DispatchGuide).find({
    where: {
      dispatchGuideID: In(dispatchGuideIDs),
      storeID,
      status: DispatchGuideStatus.EMITIDA,
    },
    relations: ['items'],
  });
}

/**
 * Bloquea las guías EMITIDA en la transacción y luego carga sus ítems para
 * planificar consumo acumulado sin carreras entre emisiones concurrentes.
 */
export async function findEmittedDispatchGuidesForUpdate(
  manager: EntityManager,
  storeID: string,
  dispatchGuideIDs: string[],
): Promise<DispatchGuide[]> {
  const locked = await manager.getRepository(DispatchGuide).find({
    where: {
      dispatchGuideID: In(dispatchGuideIDs),
      storeID,
      status: DispatchGuideStatus.EMITIDA,
    },
    lock: { mode: 'pessimistic_write' },
  });

  if (locked.length === 0) return [];

  const full = await manager.getRepository(DispatchGuide).find({
    where: {
      dispatchGuideID: In(locked.map((guide) => guide.dispatchGuideID)),
    },
    relations: ['items'],
  });
  const byId = new Map(full.map((guide) => [guide.dispatchGuideID, guide]));
  return dispatchGuideIDs
    .map((dispatchGuideID) => byId.get(dispatchGuideID))
    .filter((guide): guide is DispatchGuide => Boolean(guide));
}

export async function findDispatchGuideReferenceItems(
  manager: EntityManager,
  dispatchGuideIDs: string[],
): Promise<DispatchGuideReferenceItem[]> {
  if (dispatchGuideIDs.length === 0) return [];
  return manager.getRepository(DispatchGuideReferenceItem).find({
    where: { dispatchGuideID: In(dispatchGuideIDs) },
  });
}

export async function findStoreProductsForGuide(
  manager: EntityManager,
  storeID: string,
  items: Array<{ storeProductID: string; quantity: number }>,
): Promise<
  Array<{
    storeProductID: string;
    variationID: string;
    productName: string;
    sku: string;
    quantity: number;
  }>
> {
  const found = await manager.getRepository(StoreProduct).find({
    where: {
      store: { storeID },
      storeProductID: In(items.map((item) => item.storeProductID)),
    },
    relations: ['variation', 'variation.product'],
  });
  const byId = new Map(
    found.map((storeProduct) => [storeProduct.storeProductID, storeProduct]),
  );
  const missing = items.filter((item) => !byId.has(item.storeProductID));
  if (missing.length > 0) {
    throw new BadRequestException(
      `Uno o más productos de tienda no existen o no pertenecen a la tienda: ${missing
        .map((item) => item.storeProductID)
        .join(', ')}`,
    );
  }

  return items.map((item) => {
    const storeProduct = byId.get(item.storeProductID)!;
    return {
      storeProductID: storeProduct.storeProductID,
      variationID: storeProduct.variation.variationID,
      productName: storeProduct.variation.product.name,
      sku: storeProduct.variation.sku,
      quantity: item.quantity,
    };
  });
}

export async function listDispatchGuides(
  manager: EntityManager,
  storeID: string,
  query: ListDispatchGuidesQueryDto,
  ownership?: Ownership,
): Promise<{ dispatchGuides: DispatchGuide[]; total: number }> {
  const page = query.page ?? 1;
  const limit = query.limit ?? 50;

  const qb = manager
    .getRepository(DispatchGuide)
    .createQueryBuilder('guide')
    .leftJoinAndSelect('guide.items', 'items')
    .leftJoinAndSelect('guide.store', 'store')
    .leftJoinAndSelect('guide.dteDocument', 'dteDocument')
    .leftJoinAndSelect('guide.references', 'references')
    .leftJoinAndSelect('references.dteDocument', 'referenceDte')
    .leftJoinAndSelect('references.items', 'referenceItems')
    .where('guide.storeID = :storeID', { storeID });
  if (ownership)
    applyOwnershipScope(qb, 'guide', ownership.scope, ownership.ownerId);

  if (query.status) {
    qb.andWhere('guide.status = :status', { status: query.status });
  }
  if (query.from) {
    qb.andWhere('guide.createdAt >= :from', { from: query.from });
  }
  if (query.to) {
    qb.andWhere('guide.createdAt < :to', { to: query.to });
  }

  const [dispatchGuides, total] = await qb
    .orderBy('guide.createdAt', 'DESC')
    .skip((page - 1) * limit)
    .take(limit)
    .getManyAndCount();

  return { dispatchGuides, total };
}

export function createDispatchGuideEntity(
  manager: EntityManager,
  input: {
    dispatchGuideID: string;
    tenantID: string | undefined;
    storeID: string;
    userID: string;
    impersonatedBy?: string | null;
    idempotencyKey: string | null;
    prepared: PreparedDispatchGuide;
  },
): DispatchGuide {
  return manager.create(DispatchGuide, {
    dispatchGuideID: input.dispatchGuideID,
    tenantID: input.tenantID,
    store: { storeID: input.storeID },
    userID: input.userID,
    impersonatedBy: input.impersonatedBy ?? null,
    status: input.prepared.status,
    idempotencyKey: input.idempotencyKey,
    issueDate: input.prepared.issueDate,
    receiver: input.prepared.receiver,
    destination: input.prepared.destination,
    transport: input.prepared.transport,
    indTraslado: input.prepared.indTraslado,
    includePrices: input.prepared.includePrices,
    subtotal: input.prepared.subtotal,
    discount: input.prepared.discount,
    netTotal: input.prepared.netTotal,
    taxTotal: input.prepared.taxTotal,
    total: input.prepared.total,
    cogsTotal: input.prepared.cogsTotal,
    folio: null,
    dteDocumentID: null,
    payloadRaw: null,
    errorDetail: null,
  });
}

export function createDispatchGuideItems(
  manager: EntityManager,
  tenantID: string | undefined,
  dispatchGuideID: string,
  items: PreparedDispatchGuide['items'],
): DispatchGuideItem[] {
  return items.map((item) =>
    manager.create(DispatchGuideItem, {
      tenantID,
      guide: { dispatchGuideID },
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
