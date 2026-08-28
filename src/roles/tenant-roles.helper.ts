import { EntityManager } from 'typeorm';
import { PermissionScope } from './entities/role-permission.entity';
import { RolePermission } from './entities/role-permission.entity';
import { Role } from './entities/role.entity';
import { Permission } from './entities/permission.entity';

const BASE_PERMISSION_KEYS = [
  'sales:read',
  'sales:write',
  'sales:convert',
  'dispatch-guides:read',
  'dispatch-guides:write',
  'returns:read',
  'returns:write',
  'dte:read',
  'stores:read',
];

export async function ensureTenantRoles(
  manager: EntityManager,
  tenantID: string,
): Promise<Map<string, Role>> {
  const roleRepository = manager.getRepository(Role);
  if (!roleRepository) return new Map<string, Role>();
  for (const [name, systemKey] of [
    ['admin', 'TENANT_ADMIN'],
    ['store_manager', 'STORE_MANAGER'],
    ['consignado', 'CONSIGNADO'],
    ['tercero', 'TERCERO'],
    ['system', 'SYSTEM'],
  ] as const) {
    await roleRepository
      .createQueryBuilder()
      .insert()
      .into(Role)
      .values({
        tenantID,
        name,
        systemKey,
        isSystem: false,
      })
      .orIgnore()
      .execute();
  }
  const roles = await roleRepository.find({ where: { tenantID } });
  const permissionRepository = manager.getRepository(Permission);
  if (!permissionRepository)
    return new Map(roles.map((role) => [role.name, role]));
  const permissions = await permissionRepository.find();
  const permissionKeys = new Set(
    permissions.map((permission) => permission.key),
  );
  for (const role of roles) {
    if (role.isSystem) continue;
    const keys =
      role.name === 'admin'
        ? [...permissionKeys]
        : role.name === 'system'
          ? []
          : BASE_PERMISSION_KEYS;
    for (const permissionKey of keys) {
      await manager
        .getRepository(RolePermission)
        .createQueryBuilder()
        .insert()
        .into(RolePermission)
        .values({
          tenantID,
          roleID: role.id,
          permissionKey,
          scope: PermissionScope.ALL,
        })
        .orIgnore()
        .execute();
    }
  }
  await roleRepository
    .createQueryBuilder()
    .update(Role)
    .set({ isSystem: true })
    .where(
      '"tenantID" = :tenantID AND "systemKey" IN (:...keys) AND "isSystem" = false',
      {
        tenantID,
        keys: ['TENANT_ADMIN', 'SYSTEM'],
      },
    )
    .execute();
  return new Map(
    roles.flatMap((role) => [
      [role.name, role],
      [role.id, role],
    ]),
  );
}
