import { BadRequestException, Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { DataSource, EntityManager } from 'typeorm';

export interface TenantRequestContext {
  tenantId: string;
  userId?: string;
  masterUserId?: string;
  impersonating: boolean;
}

@Injectable()
export class TenantContextService {
  private readonly storage = new AsyncLocalStorage<TenantRequestContext>();
  constructor(private readonly dataSource: DataSource) {}

  run<T>(context: TenantRequestContext, callback: () => T): T {
    return this.storage.run(context, callback);
  }
  get(required = true): TenantRequestContext | undefined {
    const value = this.storage.getStore();
    if (!value && required)
      throw new BadRequestException('Tenant context is required');
    return value;
  }
  getTenantId(): string {
    return this.get()!.tenantId;
  }

  async transaction<T>(
    callback: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    const tenantId = this.getTenantId();
    return this.dataSource.transaction(async (manager) => {
      await manager.query(`SELECT set_config('app.tenant_id', $1, true)`, [
        tenantId,
      ]);
      return callback(manager);
    });
  }
}
