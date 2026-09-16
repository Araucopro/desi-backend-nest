import { MigrationInterface, QueryRunner } from 'typeorm';

export class SeedHrAttendancePermissions1788886000000 implements MigrationInterface {
  name = 'SeedHrAttendancePermissions1788886000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT INTO "permissions" ("key", "subject", "action", "supportsOwnScope", "description")
       VALUES
         ('hr-attendance:read', 'Attendance', 'read', true, 'Ver asistencia de trabajadores'),
         ('hr-attendance:manage', 'Attendance', 'manage', false, 'Administrar asistencia y cierres de tiendas')
       ON CONFLICT ("key") DO NOTHING`,
    );

    await queryRunner.query(
      `INSERT INTO "role_permissions" ("tenantID", "roleID", "permissionKey", "scope")
       SELECT r."tenantID", r."id", 'hr-attendance:read',
              CASE WHEN r."systemKey" IN ('CONSIGNADO', 'TERCERO') THEN 'OWN'::"public"."role_permissions_scope_enum" ELSE 'ALL'::"public"."role_permissions_scope_enum" END
       FROM "roles" r
       WHERE r."systemKey" IN ('TENANT_ADMIN', 'STORE_MANAGER', 'CONSIGNADO', 'TERCERO')
       ON CONFLICT ("tenantID", "roleID", "permissionKey") DO UPDATE SET "scope" = EXCLUDED."scope"`,
    );

    await queryRunner.query(
      `INSERT INTO "role_permissions" ("tenantID", "roleID", "permissionKey", "scope")
       SELECT r."tenantID", r."id", 'hr-attendance:manage', 'ALL'::"public"."role_permissions_scope_enum"
       FROM "roles" r
       WHERE r."systemKey" IN ('TENANT_ADMIN', 'STORE_MANAGER')
       ON CONFLICT ("tenantID", "roleID", "permissionKey") DO UPDATE SET "scope" = EXCLUDED."scope"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "role_permissions" WHERE "permissionKey" IN ('hr-attendance:read', 'hr-attendance:manage')`,
    );
    await queryRunner.query(
      `DELETE FROM "permissions" WHERE "key" IN ('hr-attendance:read', 'hr-attendance:manage')`,
    );
  }
}
