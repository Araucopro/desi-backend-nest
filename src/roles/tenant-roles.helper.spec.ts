import { InternalServerErrorException } from '@nestjs/common';
import { ensureTenantRoles } from './tenant-roles.helper';
import {
  BASE_PERMISSION_KEYS,
  PERMISSION_CATALOG,
} from './permission-catalog.constants';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';

const ROLES = [
  {
    id: 'r-admin',
    tenantID: TENANT_ID,
    name: 'admin',
    systemKey: 'TENANT_ADMIN',
    isSystem: false,
  },
  {
    id: 'r-sm',
    tenantID: TENANT_ID,
    name: 'store_manager',
    systemKey: 'STORE_MANAGER',
    isSystem: false,
  },
  {
    id: 'r-consignado',
    tenantID: TENANT_ID,
    name: 'consignado',
    systemKey: 'CONSIGNADO',
    isSystem: false,
  },
  {
    id: 'r-tercero',
    tenantID: TENANT_ID,
    name: 'tercero',
    systemKey: 'TERCERO',
    isSystem: false,
  },
  {
    id: 'r-system',
    tenantID: TENANT_ID,
    name: 'system',
    systemKey: 'SYSTEM',
    isSystem: false,
  },
];

function permissionsFromKeys(keys: readonly string[]) {
  return keys.map((key) => {
    const entry = PERMISSION_CATALOG.find(
      (permission) => permission.key === key,
    );
    if (!entry) throw new Error(`Unknown catalog key in test: ${key}`);
    return {
      key,
      subject: entry.subject,
      action: entry.action,
      supportsOwnScope: entry.supportsOwnScope,
      description: entry.description,
    };
  });
}

function createQueryBuilderMock() {
  return {
    insert: jest.fn().mockReturnThis(),
    into: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    orIgnore: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue(undefined),
  };
}

function createManager(permissionKeys: readonly string[]) {
  const roleQb = createQueryBuilderMock();
  const rolePermissionQb = createQueryBuilderMock();
  const manager = {
    getRepository: jest.fn((entity: { name: string }) => {
      switch (entity.name) {
        case 'Role':
          return {
            createQueryBuilder: jest.fn().mockReturnValue(roleQb),
            find: jest.fn().mockResolvedValue(ROLES),
          };
        case 'Permission':
          return {
            find: jest
              .fn()
              .mockResolvedValue(permissionsFromKeys(permissionKeys)),
          };
        case 'RolePermission':
          return {
            createQueryBuilder: jest.fn().mockReturnValue(rolePermissionQb),
          };
        default:
          return {};
      }
    }),
  };
  return { manager, roleQb, rolePermissionQb };
}

describe('ensureTenantRoles', () => {
  it('seeds protected roles and permissions idempotently with a complete catalog', async () => {
    const { manager, roleQb, rolePermissionQb } = createManager(
      PERMISSION_CATALOG.map((permission) => permission.key),
    );

    const result = await ensureTenantRoles(manager as never, TENANT_ID);

    expect(result.size).toBe(ROLES.length * 2);
    expect(result.get('admin')?.id).toBe('r-admin');
    expect(result.get('r-sm')?.name).toBe('store_manager');
    expect(result.get('system')?.id).toBe('r-system');

    expect(roleQb.insert).toHaveBeenCalledTimes(ROLES.length);
    expect(roleQb.orIgnore).toHaveBeenCalledTimes(ROLES.length);
    expect(roleQb.update).toHaveBeenCalledTimes(1);
    expect(roleQb.where).toHaveBeenCalledTimes(1);

    const expectedPermissionInserts =
      PERMISSION_CATALOG.length + 3 * BASE_PERMISSION_KEYS.length;
    expect(rolePermissionQb.insert).toHaveBeenCalledTimes(
      expectedPermissionInserts,
    );
    expect(rolePermissionQb.orIgnore).toHaveBeenCalledTimes(
      expectedPermissionInserts,
    );

    const inserted = rolePermissionQb.values.mock.calls.map(
      (call) =>
        call[0] as { roleID: string; permissionKey: string; scope: string },
    );
    expect(inserted.every((item) => item.scope === 'ALL')).toBe(true);
    expect(inserted.some((item) => item.roleID === 'r-system')).toBe(false);

    const adminKeys = new Set(
      inserted
        .filter((item) => item.roleID === 'r-admin')
        .map((item) => item.permissionKey),
    );
    expect(adminKeys.size).toBe(PERMISSION_CATALOG.length);
    expect([...adminKeys].sort()).toEqual(
      PERMISSION_CATALOG.map((permission) => permission.key).sort(),
    );

    for (const roleID of ['r-sm', 'r-consignado', 'r-tercero']) {
      const keys = new Set(
        inserted
          .filter((item) => item.roleID === roleID)
          .map((item) => item.permissionKey),
      );
      expect(keys.size).toBe(BASE_PERMISSION_KEYS.length);
      expect([...keys].sort()).toEqual([...BASE_PERMISSION_KEYS].sort());
    }
  });

  it('fails fast with a clear error before writing when the catalog is missing a base key', async () => {
    const missingKey = 'stores:read';
    const keysWithoutStoresRead = PERMISSION_CATALOG.filter(
      (permission) => permission.key !== missingKey,
    ).map((permission) => permission.key);
    const { manager, roleQb, rolePermissionQb } = createManager(
      keysWithoutStoresRead,
    );

    await expect(
      ensureTenantRoles(manager as never, TENANT_ID),
    ).rejects.toThrow(InternalServerErrorException);
    await expect(
      ensureTenantRoles(manager as never, TENANT_ID),
    ).rejects.toThrow(
      `Role seed blocked: permissions missing from catalog: ${missingKey}`,
    );

    expect(roleQb.insert).not.toHaveBeenCalled();
    expect(rolePermissionQb.insert).not.toHaveBeenCalled();
  });
});
