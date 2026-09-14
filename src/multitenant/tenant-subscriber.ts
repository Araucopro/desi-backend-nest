import {
  EntitySubscriberInterface,
  EventSubscriber,
  InsertEvent,
} from 'typeorm';
import { tenantContextStorage } from './tenant-context.storage';

/**
 * Asigna automáticamente `tenantID` en los INSERT de entidades de negocio
 * cuando la request se ejecuta dentro del contexto tenant (JWT).
 *
 * Si la entidad ya trae `tenantID` (patrón explícito usado por varios
 * servicios), no lo sobrescribe. Si no hay contexto tenant (flujos
 * master/tests), deja el valor tal cual para no alterar esos flujos.
 */
@EventSubscriber()
export class TenantSubscriber implements EntitySubscriberInterface {
  beforeInsert(event: InsertEvent<Record<string, unknown>>): void {
    if (!event.metadata.hasColumnWithPropertyPath('tenantID')) return;

    const entity = event.entity;
    if (entity.tenantID != null) return;

    const context = tenantContextStorage.getStore();
    if (!context) return;

    entity.tenantID = context.tenantId;
  }
}
