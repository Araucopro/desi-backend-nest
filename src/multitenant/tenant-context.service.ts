import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import {
  TenantRequestContext,
  tenantContextStorage,
} from './tenant-context.storage';

export type { TenantRequestContext } from './tenant-context.storage';

export const DEFAULT_TENANT_TIMEZONE = 'America/Santiago';

@Injectable()
export class TenantContextService {
  constructor(private readonly dataSource: DataSource) {}

  run<T>(context: TenantRequestContext, callback: () => T): T {
    return tenantContextStorage.run(context, callback);
  }

  get(required = true): TenantRequestContext | undefined {
    const value = tenantContextStorage.getStore();
    if (!value && required)
      throw new BadRequestException('Tenant context is required');
    return value;
  }

  getTenantId(): string {
    return this.get()!.tenantId;
  }

  getTimeZone(): string {
    const context = this.get(false);
    return context?.timeZone || DEFAULT_TENANT_TIMEZONE;
  }

  async transaction<T>(
    callback: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    const tenantId = this.getTenantId();
    const timeZone = this.getTimeZone();
    return this.dataSource.transaction(async (manager) => {
      await manager.query(`SELECT set_config('app.tenant_id', $1, true)`, [
        tenantId,
      ]);
      await manager.query(`SELECT set_config('timezone', $1, true)`, [
        timeZone,
      ]);
      return callback(manager);
    });
  }
}
