import {
  EventSubscriber,
  EntitySubscriberInterface,
  InsertEvent,
} from 'typeorm';
import { TenantContextService } from './tenant-context.service';

@EventSubscriber()
export class TenantSubscriber implements EntitySubscriberInterface {
  constructor(private readonly context: TenantContextService) {}
  beforeInsert(event: InsertEvent<unknown>): void {
    const entity = event.entity as Record<string, unknown>;
    if (!('tenantID' in entity) || entity.tenantID) return;
    entity.tenantID = this.context.getTenantId();
  }
}
