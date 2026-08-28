import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * PostgreSQL does not safely allow using a newly added enum value inside the
 * same transaction that added it. This migration is intentionally
 * non-transactional so Users.role can be normalized after the ALTER TYPE.
 */
export class NormalizeSystemRole20260828000300 implements MigrationInterface {
  name = 'NormalizeSystemRole20260828000300';
  public transaction = false;

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
    if (
      !roleLabels.some(
        (row: { enumlabel: string }) => row.enumlabel === 'admin',
      )
    ) {
      throw new Error(
        'public.Users_role_enum does not contain the legacy admin value',
      );
    }

    await queryRunner.query(
      `ALTER TYPE "Users_role_enum" ADD VALUE IF NOT EXISTS 'system'`,
    );
    await queryRunner.query(
      `UPDATE "Users" SET role = 'system'
       WHERE "isSystem" = true AND role <> 'system'`,
    );
    const invalidSystemRoles = await queryRunner.query(
      `SELECT count(*)::int AS count FROM "Users"
       WHERE "isSystem" = true AND role <> 'system'`,
    );
    if (Number(invalidSystemRoles[0]?.count ?? 0) > 0) {
      throw new Error('System users could not be normalized to role=system');
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    throw new Error(
      'Cannot safely remove Users_role_enum.system; restore system users first',
    );
  }
}
