import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Inserta los nuevos permisos del módulo de clientes en la tabla permissions
 * y los asocia a los roles del sistema (TENANT_ADMIN recibe todo; STORE_MANAGER,
 * CONSIGNADO y TERCERO reciben clients:read).
 */
export class ClientsPermissions20260831020000 implements MigrationInterface {
  name = 'ClientsPermissions20260831020000';

  private readonly permissions = [
    ['clients:read', 'Client', 'read', false, 'Ver clientes'],
    ['clients:manage', 'Client', 'manage', false, 'Administrar clientes'],
  ] as const;

  private readonly basePermissionKeys = ['clients:read'] as const;

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

  async down(): Promise<void> {
    throw new Error(
      'Cannot safely revert permission catalog additions; permissions and role_permissions rows remain.',
    );
  }
}
