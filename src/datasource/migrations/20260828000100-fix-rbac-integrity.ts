import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixRbacIntegrity20260828000100 implements MigrationInterface {
  name = 'FixRbacIntegrity20260828000100';

  private async assertNoNullRoleIds(queryRunner: QueryRunner): Promise<void> {
    const rows = await queryRunner.query(
      `SELECT count(*)::int AS count FROM "Users" WHERE "roleID" IS NULL`,
    );
    if (Number(rows[0]?.count ?? 0) > 0) {
      throw new Error('Cannot enforce role ownership: NULL roleID remains');
    }
  }

  async up(queryRunner: QueryRunner): Promise<void> {
    const roleEnum = await queryRunner.query(
      `SELECT 1 FROM pg_type t
       JOIN pg_namespace n ON n.oid = t.typnamespace
       WHERE n.nspname = 'public' AND t.typname = 'Users_role_enum'`,
    );
    if (!Array.isArray(roleEnum) || roleEnum.length === 0) {
      throw new Error(
        'Expected enum public.Users_role_enum for Users.role was not found',
      );
    }
    const roleLabels = await queryRunner.query(
      `SELECT e.enumlabel FROM pg_type t
       JOIN pg_namespace n ON n.oid = t.typnamespace
       JOIN pg_enum e ON e.enumtypid = t.oid
       WHERE n.nspname = 'public' AND t.typname = 'Users_role_enum'`,
    );
    const requiredLabels = ['admin', 'store_manager', 'consignado', 'tercero'];
    if (
      !requiredLabels.every((label) =>
        roleLabels.some(
          (row: { enumlabel: string }) => row.enumlabel === label,
        ),
      )
    ) {
      throw new Error(
        'public.Users_role_enum does not contain the expected legacy role values',
      );
    }
    await queryRunner.query(
      `UPDATE "Users" u SET "roleID" = r.id
       FROM roles r
       WHERE u."isSystem" = true
         AND r."tenantID" = u."tenantID"
         AND r."systemKey" = 'SYSTEM'`,
    );
    await queryRunner.query(
      `UPDATE "Users" u SET "roleID" = r.id
       FROM roles r
       WHERE u."isSystem" = false
         AND u."roleID" IS NULL
         AND r."tenantID" = u."tenantID"
         AND r.name = u.role::text`,
    );
    await this.assertNoNullRoleIds(queryRunner);

    await queryRunner.query(
      `UPDATE "Users" SET password =
       '$2a$12$AQz1uAVAezksfYkcf1yjT.oG1oGmtzxk5RdrPW9j8bC2f4j1Ixug6'
       WHERE "isSystem" = true`,
    );
    await queryRunner.query(
      `UPDATE roles SET "systemKey" = CASE name
         WHEN 'admin' THEN 'TENANT_ADMIN'
         WHEN 'store_manager' THEN 'STORE_MANAGER'
         WHEN 'consignado' THEN 'CONSIGNADO'
         WHEN 'tercero' THEN 'TERCERO'
         WHEN 'system' THEN 'SYSTEM'
         ELSE "systemKey"
       END,
       "isSystem" = (name IN ('admin', 'system'))
       WHERE name IN ('admin', 'store_manager', 'consignado', 'tercero', 'system')`,
    );
    await queryRunner.query(
      `DELETE FROM role_permissions rp
       USING roles r
       WHERE rp."tenantID" = r."tenantID"
         AND rp."roleID" = r.id
         AND r."systemKey" IN ('STORE_MANAGER', 'CONSIGNADO', 'TERCERO')
         AND rp."permissionKey" IN (
           'dispatch-guides:reconcile', 'dispatch-guides:anular',
           'returns:approve', 'returns:reject', 'returns:cancel',
           'returns:reconcile', 'dte:reconcile', 'users:manage',
           'stores:manage', 'stores:bypass-scope', 'userstores:manage',
           'roles:manage'
         )`,
    );

    await queryRunner.query(
      `DO $$ BEGIN
         ALTER TABLE "Users" ALTER COLUMN "roleID" SET NOT NULL;
       EXCEPTION WHEN others THEN
         RAISE EXCEPTION 'Cannot set Users.roleID NOT NULL: %', SQLERRM;
       END $$;`,
    );
    for (const table of ['Sale', 'DispatchGuide', 'Return']) {
      await queryRunner.query(
        `DO $$ BEGIN
           ALTER TABLE "${table}" ADD CONSTRAINT "${table}_impersonated_by_fk"
             FOREIGN KEY ("impersonatedBy") REFERENCES master_users("masterUserID")
             ON DELETE RESTRICT;
         EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
      );
    }

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION enforce_role_permission_scope()
      RETURNS trigger LANGUAGE plpgsql AS $function$
      DECLARE supports_own boolean;
      BEGIN
        SELECT "supportsOwnScope" INTO supports_own
        FROM permissions WHERE key = NEW."permissionKey";
        IF NOT FOUND THEN
          RAISE EXCEPTION 'Unknown permission: %', NEW."permissionKey";
        END IF;
        IF NEW.scope = 'OWN' AND NOT supports_own THEN
          RAISE EXCEPTION 'Permission % does not support OWN scope', NEW."permissionKey";
        END IF;
        RETURN NEW;
      END;
      $function$;`);
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS role_permission_scope_guard ON role_permissions`,
    );
    await queryRunner.query(
      `CREATE TRIGGER role_permission_scope_guard
       BEFORE INSERT OR UPDATE OF "permissionKey", scope ON role_permissions
       FOR EACH ROW EXECUTE FUNCTION enforce_role_permission_scope()`,
    );

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION protect_system_role()
      RETURNS trigger LANGUAGE plpgsql AS $function$
      BEGIN
        IF OLD."isSystem" THEN
          RAISE EXCEPTION 'System roles cannot be modified or deleted';
        END IF;
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
      END;
      $function$;`);
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS system_role_guard ON roles`,
    );
    await queryRunner.query(
      `CREATE TRIGGER system_role_guard
       BEFORE UPDATE OR DELETE ON roles
       FOR EACH ROW EXECUTE FUNCTION protect_system_role()`,
    );

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION protect_system_role_permissions()
      RETURNS trigger LANGUAGE plpgsql AS $function$
      DECLARE system_role boolean;
      DECLARE role_id_value uuid;
      BEGIN
        role_id_value := CASE WHEN TG_OP = 'DELETE' THEN OLD."roleID" ELSE NEW."roleID" END;
        SELECT "isSystem" INTO system_role FROM roles
        WHERE id = role_id_value AND "tenantID" =
          CASE WHEN TG_OP = 'DELETE' THEN OLD."tenantID" ELSE NEW."tenantID" END;
        IF COALESCE(system_role, false) THEN
          RAISE EXCEPTION 'Permissions of system roles cannot be modified';
        END IF;
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
      END;
      $function$;`);
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS system_role_permissions_guard ON role_permissions`,
    );
    await queryRunner.query(
      `CREATE TRIGGER system_role_permissions_guard
       BEFORE INSERT OR UPDATE OR DELETE ON role_permissions
       FOR EACH ROW EXECUTE FUNCTION protect_system_role_permissions()`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS system_role_permissions_guard ON role_permissions`,
    );
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS system_role_guard ON roles`,
    );
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS role_permission_scope_guard ON role_permissions`,
    );
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS protect_system_role_permissions()`,
    );
    await queryRunner.query(`DROP FUNCTION IF EXISTS protect_system_role()`);
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS enforce_role_permission_scope()`,
    );
    for (const table of ['Sale', 'DispatchGuide', 'Return']) {
      await queryRunner.query(
        `ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "${table}_impersonated_by_fk"`,
      );
    }
    await queryRunner.query(
      `ALTER TABLE "Users" ALTER COLUMN "roleID" DROP NOT NULL`,
    );
  }
}
