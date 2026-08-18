import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agrega status a Users (ACTIVE/INACTIVE) para filtros de administración.
 * Los usuarios existentes quedan ACTIVE por defecto.
 */
export class AddUserStatus20260818000100 implements MigrationInterface {
  name = 'AddUserStatus20260818000100';

  async up(queryRunner: QueryRunner): Promise<void> {
    const exists = await queryRunner.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'Users'`,
    );
    if (exists && (exists as unknown[]).length > 0) {
      await queryRunner.query(
        `ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "status" character varying(20) NOT NULL DEFAULT 'ACTIVE'`,
      );
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "users_tenant_status_idx"
         ON "Users" ("tenantID", "status")`,
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "users_tenant_status_idx"`);
    await queryRunner.query(
      `ALTER TABLE "Users" DROP COLUMN IF EXISTS "status"`,
    );
  }
}
