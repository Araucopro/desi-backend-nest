import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Repara el catálogo global de permisos en bases migradas con una versión
 * anterior de 20260828000000-dynamic-rbac.ts, donde claves como `stores:read`
 * no fueron insertadas porque TypeORM solo ejecuta cada migración una vez.
 *
 * Además reconcilia role_permissions de los roles protegidos de tenants ya
 * existentes (admin = catálogo completo; store_manager/consignado/tercero =
 * claves base), replicando la semántica de ensureTenantRoles sin tocar roles
 * personalizados. Corre como usuario privilegiado de migraciones, por lo que
 * los triggers de roles system permiten el seed (ver README de migraciones).
 */
export class EnsurePermissionCatalog20260828000400 implements MigrationInterface {
  name = 'EnsurePermissionCatalog20260828000400';

  private readonly permissions = [
    ['sales:read', 'Sale', 'read', true, 'Ver ventas'],
    ['sales:write', 'Sale', 'write', true, 'Crear ventas'],
    ['sales:convert', 'Sale', 'convert', true, 'Convertir ventas'],
    [
      'dispatch-guides:read',
      'DispatchGuide',
      'read',
      true,
      'Ver guías de despacho',
    ],
    [
      'dispatch-guides:write',
      'DispatchGuide',
      'write',
      true,
      'Crear guías de despacho',
    ],
    [
      'dispatch-guides:reconcile',
      'DispatchGuide',
      'reconcile',
      true,
      'Reconciliar guías',
    ],
    ['dispatch-guides:anular', 'DispatchGuide', 'anular', true, 'Anular guías'],
    ['returns:read', 'Return', 'read', true, 'Ver devoluciones'],
    ['returns:write', 'Return', 'write', true, 'Crear devoluciones'],
    ['returns:approve', 'Return', 'approve', true, 'Aprobar devoluciones'],
    ['returns:reject', 'Return', 'reject', true, 'Rechazar devoluciones'],
    ['returns:cancel', 'Return', 'cancel', true, 'Cancelar devoluciones'],
    [
      'returns:reconcile',
      'Return',
      'reconcile',
      true,
      'Reconciliar devoluciones',
    ],
    ['dte:read', 'DteDocument', 'read', false, 'Ver documentos DTE'],
    [
      'dte:reconcile',
      'DteDocument',
      'reconcile',
      false,
      'Reconciliar documentos DTE',
    ],
    ['users:manage', 'User', 'manage', false, 'Administrar usuarios'],
    ['stores:manage', 'Store', 'manage', false, 'Administrar tiendas'],
    ['stores:read', 'Store', 'read', false, 'Ver tiendas'],
    [
      'stores:bypass-scope',
      'Store',
      'bypass-scope',
      false,
      'Operar sin asignación de tienda',
    ],
    [
      'userstores:manage',
      'UserStore',
      'manage',
      false,
      'Administrar asignaciones de tienda',
    ],
    ['roles:manage', 'Role', 'manage', false, 'Administrar roles y permisos'],
  ] as const;

  private readonly basePermissionKeys = [
    'sales:read',
    'sales:write',
    'sales:convert',
    'dispatch-guides:read',
    'dispatch-guides:write',
    'returns:read',
    'returns:write',
    'dte:read',
    'stores:read',
  ] as const;

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`GRANT SELECT ON TABLE permissions TO app_runtime`);
    for (const [key, subject, action, supportsOwnScope, description] of this
      .permissions) {
      await queryRunner.query(
        `INSERT INTO permissions (key, subject, action, "supportsOwnScope", description)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (key) DO UPDATE SET subject = EXCLUDED.subject,
           action = EXCLUDED.action, "supportsOwnScope" = EXCLUDED."supportsOwnScope",
           description = EXCLUDED.description`,
        [key, subject, action, supportsOwnScope, description],
      );
    }

    const tenants = (await queryRunner.query(
      `SELECT "tenantID" FROM tenants ORDER BY "tenantID"`,
    )) as Array<{ tenantID: string }>;
    for (const { tenantID } of tenants) {
      const roleRows = (await queryRunner.query(
        `SELECT id, "systemKey" FROM roles WHERE "tenantID" = $1`,
        [tenantID],
      )) as Array<{ id: string; systemKey: string | null }>;
      for (const role of roleRows) {
        const keys =
          role.systemKey === 'TENANT_ADMIN'
            ? this.permissions.map(([key]) => key)
            : role.systemKey === 'STORE_MANAGER' ||
                role.systemKey === 'CONSIGNADO' ||
                role.systemKey === 'TERCERO'
              ? this.basePermissionKeys
              : [];
        for (const key of keys) {
          await queryRunner.query(
            `INSERT INTO role_permissions ("tenantID", "roleID", "permissionKey", scope)
             VALUES ($1, $2, $3, 'ALL')
             ON CONFLICT ("tenantID", "roleID", "permissionKey") DO NOTHING`,
            [tenantID, role.id, key],
          );
        }
      }
    }
  }

  down(): Promise<void> {
    throw new Error(
      'Cannot safely revert permission catalog repair; re-run migration:revert from 20260828000300 instead',
    );
  }
}
