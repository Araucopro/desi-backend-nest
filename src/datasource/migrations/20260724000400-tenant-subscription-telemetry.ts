import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Etapa 4 – Telemetría, Monitoreo de Cuotas y Facturación SaaS
 *
 * Añade columnas planType, subscriptionExpiresAt y autoRenew a la tabla tenants.
 */
export class TenantSubscriptionTelemetry20260724000400 implements MigrationInterface {
  name = 'TenantSubscriptionTelemetry20260724000400';

  async up(queryRunner: QueryRunner): Promise<void> {
    const exists = await queryRunner.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'tenants'`,
    );
    if (!exists || (exists as unknown[]).length === 0) return;

    await queryRunner.query(
      `DO $$ BEGIN
        CREATE TYPE "public"."tenants_plantype_enum" AS ENUM('BASIC', 'STANDARD', 'ENTERPRISE', 'CUSTOM');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;`,
    );

    await queryRunner.query(
      `ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "planType" "public"."tenants_plantype_enum" NOT NULL DEFAULT 'STANDARD'`,
    );

    await queryRunner.query(
      `ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "subscriptionExpiresAt" TIMESTAMP WITH TIME ZONE`,
    );

    await queryRunner.query(
      `ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "autoRenew" BOOLEAN NOT NULL DEFAULT true`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tenants" DROP COLUMN IF EXISTS "autoRenew"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenants" DROP COLUMN IF EXISTS "subscriptionExpiresAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenants" DROP COLUMN IF EXISTS "planType"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."tenants_plantype_enum"`,
    );
  }
}
