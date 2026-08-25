import { NotFoundException } from '@nestjs/common';
import { EntityManager, In } from 'typeorm';
import { Store } from '../stores/entities/store.entity';
import {
  DispatchGuide,
  DispatchGuideStatus,
} from './entities/dispatch-guide.entity';
import { DispatchGuideItem } from './entities/dispatch-guide-item.entity';
import { ListDispatchGuidesQueryDto } from './dto/list-dispatch-guides.query.dto';
import { PreparedDispatchGuide } from './dispatch-guides-engine';

export const DISPATCH_GUIDE_LOAD_RELATIONS = [
  'items',
  'store',
  'dteDocument',
  'references',
  'references.dteDocument',
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
): Promise<DispatchGuide> {
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

export async function listDispatchGuides(
  manager: EntityManager,
  storeID: string,
  query: ListDispatchGuidesQueryDto,
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
    .where('guide.storeID = :storeID', { storeID });

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
    userID: string | null;
    idempotencyKey: string | null;
    prepared: PreparedDispatchGuide;
  },
): DispatchGuide {
  return manager.create(DispatchGuide, {
    dispatchGuideID: input.dispatchGuideID,
    tenantID: input.tenantID,
    store: { storeID: input.storeID },
    userID: input.userID,
    status: input.prepared.status,
    idempotencyKey: input.idempotencyKey,
    issueDate: input.prepared.issueDate,
    receiver: input.prepared.receiver,
    destination: input.prepared.destination,
    transport: input.prepared.transport,
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
