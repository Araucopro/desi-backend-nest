import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Los triggers de protección deben bloquear al usuario de aplicación, pero no
 * a los owners/roles privilegiados que ejecutan migraciones versionadas.
 * Nunca se permite que app_runtime active este bypass.
 */
export class RbacTriggerMigrationBypass20260828000200 implements MigrationInterface {
  name = 'RbacTriggerMigrationBypass20260828000200';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION protect_system_role()
      RETURNS trigger LANGUAGE plpgsql AS $function$
      BEGIN
        IF current_user <> 'app_runtime' THEN
          IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
          RETURN NEW;
        END IF;
        IF OLD."isSystem" THEN
          RAISE EXCEPTION 'System roles cannot be modified or deleted';
        END IF;
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
      END;
      $function$;`);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION protect_system_role_permissions()
      RETURNS trigger LANGUAGE plpgsql AS $function$
      DECLARE system_role boolean;
      DECLARE role_id_value uuid;
      DECLARE tenant_id_value uuid;
      BEGIN
        IF current_user <> 'app_runtime' THEN
          IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
          RETURN NEW;
        END IF;
        role_id_value := CASE WHEN TG_OP = 'DELETE' THEN OLD."roleID" ELSE NEW."roleID" END;
        tenant_id_value := CASE WHEN TG_OP = 'DELETE' THEN OLD."tenantID" ELSE NEW."tenantID" END;
        SELECT "isSystem" INTO system_role FROM roles
        WHERE id = role_id_value AND "tenantID" = tenant_id_value;
        IF COALESCE(system_role, false) THEN
          RAISE EXCEPTION 'Permissions of system roles cannot be modified';
        END IF;
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
      END;
      $function$;`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
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
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION protect_system_role_permissions()
      RETURNS trigger LANGUAGE plpgsql AS $function$
      DECLARE system_role boolean;
      DECLARE role_id_value uuid;
      DECLARE tenant_id_value uuid;
      BEGIN
        role_id_value := CASE WHEN TG_OP = 'DELETE' THEN OLD."roleID" ELSE NEW."roleID" END;
        tenant_id_value := CASE WHEN TG_OP = 'DELETE' THEN OLD."tenantID" ELSE NEW."tenantID" END;
        SELECT "isSystem" INTO system_role FROM roles
        WHERE id = role_id_value AND "tenantID" = tenant_id_value;
        IF COALESCE(system_role, false) THEN
          RAISE EXCEPTION 'Permissions of system roles cannot be modified';
        END IF;
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
      END;
      $function$;`);
  }
}
