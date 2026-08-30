import { MigrationInterface, QueryRunner } from 'typeorm';

export class DynamicRbac20260828000000 implements MigrationInterface {
  name = 'DynamicRbac20260828000000';

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

  private async assertNoNullOwners(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['Sale', 'DispatchGuide', 'Return']) {
      const rows = await queryRunner.query(
        `SELECT count(*)::int AS count FROM "${table}" WHERE "userID" IS NULL`,
      );
      if (Number(rows[0]?.count ?? 0) > 0) {
        throw new Error(
          `Cannot enforce ownership on ${table}: NULL userID remains`,
        );
      }
    }
  }

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS permissions (
        key varchar(128) PRIMARY KEY,
        subject varchar(64) NOT NULL,
        action varchar(64) NOT NULL,
        "supportsOwnScope" boolean NOT NULL DEFAULT false,
        description varchar(255) NOT NULL
      )`,
    );
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

    await queryRunner.query(
      `DO $$ BEGIN CREATE TYPE "RolePermission_scope_enum" AS ENUM ('OWN', 'ALL');
       EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS roles (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantID" uuid NOT NULL,
        name varchar(128) NOT NULL,
        "systemKey" varchar(32) NULL,
        "isSystem" boolean NOT NULL DEFAULT false,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        UNIQUE ("tenantID", name),
        UNIQUE ("tenantID", id)
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS roles_tenant_system_key_uq
       ON roles ("tenantID", "systemKey") WHERE "systemKey" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS role_permissions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantID" uuid NOT NULL,
        "roleID" uuid NOT NULL,
        "permissionKey" varchar(128) NOT NULL REFERENCES permissions(key) ON DELETE RESTRICT,
        scope "RolePermission_scope_enum" NOT NULL,
        UNIQUE ("tenantID", "roleID", "permissionKey")
        ,CONSTRAINT role_permissions_role_fk
          FOREIGN KEY ("tenantID", "roleID") REFERENCES roles("tenantID", id) ON DELETE CASCADE
      )`,
    );
    for (const table of ['roles', 'role_permissions']) {
      await queryRunner.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
      await queryRunner.query(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
      await queryRunner.query(
        `DROP POLICY IF EXISTS tenant_isolation_select ON ${table}`,
      );
      await queryRunner.query(
        `CREATE POLICY tenant_isolation_select ON ${table} FOR SELECT USING ("tenantID" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)`,
      );
      await queryRunner.query(
        `DROP POLICY IF EXISTS tenant_isolation_write ON ${table}`,
      );
      await queryRunner.query(
        `CREATE POLICY tenant_isolation_write ON ${table} USING ("tenantID" = NULLIF(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenantID" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)`,
      );
      await queryRunner.query(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ${table} TO app_runtime`,
      );
    }
    await queryRunner.query(
      `ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "roleID" uuid NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "isSystem" boolean NOT NULL DEFAULT false`,
    );
    for (const table of ['Sale', 'DispatchGuide', 'Return']) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "impersonatedBy" uuid NULL`,
      );
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "${table}_tenant_user_idx" ON "${table}" ("tenantID", "userID")`,
      );
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "${table}_tenant_impersonated_by_idx" ON "${table}" ("tenantID", "impersonatedBy")`,
      );
    }

    const tenants = (await queryRunner.query(
      `SELECT "tenantID" FROM tenants ORDER BY "tenantID"`,
    )) as Array<{ tenantID: string }>;
    const roleNames = [
      'admin',
      'store_manager',
      'consignado',
      'tercero',
      'system',
    ];
    for (const { tenantID } of tenants) {
      for (const name of roleNames) {
        const systemKey =
          name === 'admin'
            ? 'TENANT_ADMIN'
            : name === 'system'
              ? 'SYSTEM'
              : null;
        await queryRunner.query(
          `INSERT INTO roles ("tenantID", name, "systemKey", "isSystem")
           VALUES ($1, $2, $3, true) ON CONFLICT ("tenantID", name) DO UPDATE
           SET "systemKey" = COALESCE(roles."systemKey", EXCLUDED."systemKey"), "isSystem" = true`,
          [tenantID, name, systemKey],
        );
      }
      const roleRows = (await queryRunner.query(
        `SELECT id, name FROM roles WHERE "tenantID" = $1`,
        [tenantID],
      )) as Array<{ id: string; name: string }>;
      for (const role of roleRows) {
        const keys =
          role.name === 'admin'
            ? this.permissions.map(([key]) => key)
            : role.name === 'system'
              ? []
              : [
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
        for (const key of keys) {
          await queryRunner.query(
            `INSERT INTO role_permissions ("tenantID", "roleID", "permissionKey", scope)
             VALUES ($1, $2, $3, 'ALL') ON CONFLICT ("tenantID", "roleID", "permissionKey") DO NOTHING`,
            [tenantID, role.id, key],
          );
        }
      }
      await queryRunner.query(
        `INSERT INTO "Users" ("tenantID", email, name, role, "roleID", "isSystem", status, password, "sessionVersion")
         SELECT $1, 'system+' || $1 || '@system.invalid', 'System', 'admin', r.id, true, 'INACTIVE', '!system-account!', 1
         FROM roles r WHERE r."tenantID" = $1 AND r."systemKey" = 'SYSTEM'
         AND NOT EXISTS (SELECT 1 FROM "Users" u WHERE u."tenantID" = $1 AND u."isSystem" = true)`,
        [tenantID],
      );
      await queryRunner.query(
        `UPDATE "Users" u SET "roleID" = r.id FROM roles r
         WHERE u."tenantID" = $1 AND r."tenantID" = u."tenantID" AND r.name = u.role::text
           AND u."roleID" IS NULL`,
        [tenantID],
      );
      await queryRunner.query(
        `UPDATE "Sale" s SET "userID" = u."userID" FROM "Users" u
         WHERE s."tenantID" = $1 AND s."userID" IS NULL AND u."tenantID" = s."tenantID" AND u."isSystem" = true`,
        [tenantID],
      );
      await queryRunner.query(
        `UPDATE "DispatchGuide" g SET "userID" = u."userID" FROM "Users" u
         WHERE g."tenantID" = $1 AND g."userID" IS NULL AND u."tenantID" = g."tenantID" AND u."isSystem" = true`,
        [tenantID],
      );
      await queryRunner.query(
        `UPDATE "Return" r SET "userID" = u."userID" FROM "Users" u
         WHERE r."tenantID" = $1 AND r."userID" IS NULL AND u."tenantID" = r."tenantID" AND u."isSystem" = true`,
        [tenantID],
      );
    }
    await this.assertNoNullOwners(queryRunner);
    await queryRunner.query(
      `DO $$ BEGIN
         ALTER TABLE "Users" ADD CONSTRAINT users_role_id_fk
           FOREIGN KEY ("roleID") REFERENCES roles(id) ON DELETE RESTRICT;
       EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    );
    await queryRunner.query(
      `DO $$ BEGIN
         ALTER TABLE "Users" ADD CONSTRAINT users_role_tenant_fk
           FOREIGN KEY ("tenantID", "roleID") REFERENCES roles("tenantID", id) ON DELETE RESTRICT;
       EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    );
    await queryRunner.query(
      `ALTER TABLE "Sale" ALTER COLUMN "userID" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "DispatchGuide" ALTER COLUMN "userID" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "Return" ALTER COLUMN "userID" SET NOT NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['roles', 'role_permissions']) {
      await queryRunner.query(
        `DROP POLICY IF EXISTS tenant_isolation_select ON ${table}`,
      );
      await queryRunner.query(
        `DROP POLICY IF EXISTS tenant_isolation_write ON ${table}`,
      );
      await queryRunner.query(
        `ALTER TABLE ${table} DISABLE ROW LEVEL SECURITY`,
      );
    }
    for (const table of ['Sale', 'DispatchGuide', 'Return']) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "userID" DROP NOT NULL`,
      );
      await queryRunner.query(
        `DROP INDEX IF EXISTS "${table}_tenant_user_idx"`,
      );
      await queryRunner.query(
        `DROP INDEX IF EXISTS "${table}_tenant_impersonated_by_idx"`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" DROP COLUMN IF EXISTS "impersonatedBy"`,
      );
    }
    await queryRunner.query(
      `ALTER TABLE "Users" DROP COLUMN IF EXISTS "roleID"`,
    );
    await queryRunner.query(
      `ALTER TABLE "Users" DROP COLUMN IF EXISTS "isSystem"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS role_permissions`);
    await queryRunner.query(`DROP TABLE IF EXISTS roles`);
    await queryRunner.query(`DROP TABLE IF EXISTS permissions`);
    await queryRunner.query(`DROP TYPE IF EXISTS "RolePermission_scope_enum"`);
  }
}
