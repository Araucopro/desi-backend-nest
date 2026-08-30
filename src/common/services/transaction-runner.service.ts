import { Injectable, Optional } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { TenantContextService } from '../../multitenant/tenant-context.service';

type TransactionCallback<T> = (manager: EntityManager) => Promise<T>;

@Injectable()
export class TransactionRunnerService {
  constructor(
    private readonly dataSource: DataSource,
    @Optional() private readonly tenantContext?: TenantContextService,
  ) {}

  run<T>(
    callback: TransactionCallback<T>,
    fallback?: (callback: TransactionCallback<T>) => Promise<T>,
  ): Promise<T> {
    if (this.tenantContext) {
      return this.tenantContext.transaction(callback);
    }

    if (fallback) {
      return fallback(callback);
    }

    return this.dataSource.transaction(callback);
  }
}
