import { InternalServerErrorException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { PermissionScope } from './entities/role-permission.entity';
import { RolePermission } from './entities/role-permission.entity';
import { Role } from './entities/role.entity';
import { Permission } from './entities/permission.entity';
import { BASE_PERMISSION_KEYS } from './permission-catalog.constants';

export async function ensureTenantRoles(
  manager: EntityManager,
  tenantID: string,
): Promise<Map<string, Role>> {
  const roleRepository = manager.getRepository(Role);
  const permissionRepository = manager.getRepository(Permission);
  if (!roleRepository || !permissionRepository) return new Map<string, Role>();

  const permissions = await permissionRepository.find();
  const permissionKeys = new Set(
    permissions.map((permission) => permission.key),
  );
  const missingKeys = BASE_PERMISSION_KEYS.filter(
    (key) => !permissionKeys.has(key),
  );
  if (missingKeys.length > 0) {
    throw new InternalServerErrorException(
      `Role seed blocked: permissions missing from catalog: ${missingKeys.join(', ')}`,
    );
  }

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
