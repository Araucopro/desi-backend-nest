import { EntityManager } from 'typeorm';
import { DteDocument } from './entities/dte-document.entity';

export async function findExistingDteDocument(
  manager: EntityManager,
  idempotencyKey?: string | null,
  purchaseOrderID?: string | null,
): Promise<DteDocument | null> {
  if (idempotencyKey) {
    const byKey = await manager.findOne(DteDocument, {
      where: { idempotencyKey },
    });
    if (byKey) return byKey;
  }

  if (purchaseOrderID) {
    const byPO = await manager.findOne(DteDocument, {
      where: { purchaseOrderID },
    });
    if (byPO) return byPO;
  }

  return null;
}
