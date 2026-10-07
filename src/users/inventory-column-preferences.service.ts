import {
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  Injectable,
  Optional,
} from '@nestjs/common';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import { Store } from '../stores/entities/store.entity';
import { UserStore } from '../relations/userstores/entities/userstore.entity';
import { Role } from '../roles/entities/role.entity';
import {
  PermissionScope,
  RolePermission,
} from '../roles/entities/role-permission.entity';
import { TenantContextService } from '../multitenant/tenant-context.service';
import { User } from './entities/user.entity';
import {
  InventoryColumnPreference,
  InventoryColumnStoreFilter,
} from './entities/inventory-column-preference.entity';
import { InventoryColumnPreferenceQueryDto } from './dto/inventory-column-preference-query.dto';
import { InventoryColumnPreferenceResponseDto } from './dto/inventory-column-preference-response.dto';

interface PreferenceContext {
  storeID?: string;
  storeFilter?: InventoryColumnStoreFilter;
}

interface PreferenceUpsertRow {
  hiddenColumns: string[];
  updatedAt: Date;
}

function isPreferenceUpsertRow(value: unknown): value is PreferenceUpsertRow {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Partial<PreferenceUpsertRow>;
  return (
    Array.isArray(row.hiddenColumns) &&
    row.hiddenColumns.every((column) => typeof column === 'string') &&
    row.updatedAt instanceof Date
  );
}

@Injectable()
export class InventoryColumnPreferencesService {
  constructor(
    private readonly dataSource: DataSource,
    @Optional() private readonly tenantContext?: TenantContextService,
  ) {}

  async getPreference(
    tenantID: string,
    userID: string,
    query: InventoryColumnPreferenceQueryDto,
  ): Promise<InventoryColumnPreferenceResponseDto> {
    const context = this.resolveContext(query);
    return this.runInTenantTransaction(tenantID, async (manager) => {
      await this.assertContextAccess(manager, tenantID, userID, context);
      const preference = await manager
        .getRepository(InventoryColumnPreference)
        .findOne({
          where: {
            tenantID,
            userID,
            storeID: context.storeID ?? IsNull(),
            storeFilter: context.storeFilter ?? IsNull(),
          },
        });

      if (!preference) {
        return { exists: false, hiddenColumns: [], updatedAt: null };
      }

      return {
        exists: true,
        hiddenColumns: preference.hiddenColumns,
        updatedAt: preference.updatedAt,
      };
    });
  }

  async replacePreference(
    tenantID: string,
    userID: string,
    query: InventoryColumnPreferenceQueryDto,
    hiddenColumns: string[],
  ): Promise<InventoryColumnPreferenceResponseDto> {
    const context = this.resolveContext(query);
    const normalizedColumns = [
      ...new Set(hiddenColumns.map((column) => column.trim())),
    ];

    return this.runInTenantTransaction(tenantID, async (manager) => {
      await this.assertContextAccess(manager, tenantID, userID, context);

      const filterColumn = context.storeID ? '"storeID"' : '"storeFilter"';
      const partialIndexPredicate = context.storeID
        ? '"storeID" IS NOT NULL'
        : '"storeFilter" IS NOT NULL';
      const rows: unknown = await manager.query(
        `INSERT INTO "UserInventoryColumnPreference"
          ("tenantID", "userID", "storeID", "storeFilter", "hiddenColumns")
         VALUES ($1, $2, $3, $4, $5::jsonb)
         ON CONFLICT ("tenantID", "userID", ${filterColumn})
           WHERE ${partialIndexPredicate}
         DO UPDATE SET
           "hiddenColumns" = EXCLUDED."hiddenColumns",
           "updatedAt" = clock_timestamp()
         RETURNING "hiddenColumns", "updatedAt"`,
        [
          tenantID,
          userID,
          context.storeID ?? null,
          context.storeFilter ?? null,
          JSON.stringify(normalizedColumns),
        ],
      );
      const row: unknown = Array.isArray(rows) ? rows[0] : undefined;
      if (!isPreferenceUpsertRow(row)) {
        throw new InternalServerErrorException(
          'La preferencia de columnas no pudo guardarse',
        );
      }

      return {
        exists: true,
        hiddenColumns: row.hiddenColumns,
        updatedAt: row.updatedAt,
      };
    });
  }

  private resolveContext(
    query: InventoryColumnPreferenceQueryDto,
  ): PreferenceContext {
    const hasStoreID = Boolean(query.storeID);
    const hasStoreFilter = Boolean(query.storeFilter);
    if (hasStoreID === hasStoreFilter) {
      throw new BadRequestException(
        'Proporcione exactamente uno de storeID o storeFilter',
      );
    }
    return hasStoreID
      ? { storeID: query.storeID }
      : { storeFilter: query.storeFilter };
  }

  private async assertContextAccess(
    manager: EntityManager,
    tenantID: string,
    userID: string,
    context: PreferenceContext,
  ): Promise<void> {
    if (this.tenantContext && this.tenantContext.getTenantId() !== tenantID) {
      throw new ForbiddenException('Tenant context does not match token');
    }

    const user = await manager.getRepository(User).findOne({
      where: { tenantID, userID },
      select: ['userID', 'roleID'],
    });
    if (!user) throw new ForbiddenException('Tenant user not found');

    const role = await manager.getRepository(Role).findOne({
      where: { tenantID, id: user.roleID },
      select: ['id', 'systemKey'],
    });
    const isTenantAdmin = role?.systemKey === 'TENANT_ADMIN';

    if (context.storeFilter) {
      if (!isTenantAdmin) {
        throw new ForbiddenException(
          'Solo el rol TENANT_ADMIN puede guardar preferencias de vistas agregadas',
        );
      }
      return;
    }

    const storeID = context.storeID!;
    const store = await manager.getRepository(Store).findOne({
      where: { tenantID, storeID },
      select: ['storeID'],
    });
    if (!store) {
      throw new ForbiddenException('No tiene acceso a la tienda solicitada');
    }

    const hasGlobalStoreScope = role
      ? await manager.getRepository(RolePermission).findOne({
          where: {
            tenantID,
            roleID: role.id,
            permissionKey: 'stores:bypass-scope',
            scope: PermissionScope.ALL,
          },
          select: ['id'],
        })
      : null;
    if (isTenantAdmin || hasGlobalStoreScope) return;

    const activeAssignment = await manager.getRepository(UserStore).findOne({
      where: {
        tenantID,
        user: { userID },
        store: { storeID },
        effectiveTo: IsNull(),
        removedAt: IsNull(),
      },
      select: ['userStoreID'],
    });
    if (!activeAssignment) {
      throw new ForbiddenException('No tiene acceso a la tienda solicitada');
    }
  }

  private runInTenantTransaction<T>(
    tenantID: string,
    callback: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    if (this.tenantContext) {
      return this.tenantContext.transaction(callback);
    }
    return this.dataSource.transaction(callback);
  }
}
