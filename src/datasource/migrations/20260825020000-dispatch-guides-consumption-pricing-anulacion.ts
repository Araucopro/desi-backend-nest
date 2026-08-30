import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ajustes del módulo Guías de Despacho:
 *
 * - Nuevo estado ANULACION_PENDIENTE en DispatchGuide_status_enum.
 * - Columnas indTraslado / includePrices en DispatchGuide.
 * - Nueva tabla DispatchGuideReferenceItem para consumo acumulado
 *   GD -> factura/boleta, con RLS e índices compuestos.
 */
export class DispatchGuidesConsumptionPricingAnulacion20260825020000 implements MigrationInterface {
  name = 'DispatchGuidesConsumptionPricingAnulacion20260825020000';

  private async enableRls(
    queryRunner: QueryRunner,
    table: string,
  ): Promise<void> {
    await queryRunner.query(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`);
    await queryRunner.query(
      `DROP POLICY IF EXISTS tenant_isolation_select ON "${table}"`,
    );
    await queryRunner.query(
      `CREATE POLICY tenant_isolation_select ON "${table}"
       FOR SELECT USING ("tenantID" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)`,
    );
    await queryRunner.query(
      `DROP POLICY IF EXISTS tenant_isolation_write ON "${table}"`,
    );
    await queryRunner.query(
      `CREATE POLICY tenant_isolation_write ON "${table}"
       USING ("tenantID" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
       WITH CHECK ("tenantID" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)`,
    );
    await queryRunner.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "${table}" TO app_runtime`,
    );
  }

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "DispatchGuide_status_enum" ADD VALUE IF NOT EXISTS 'ANULACION_PENDIENTE'`,
    );

    await queryRunner.query(
      `ALTER TABLE "DispatchGuide"
       ADD COLUMN IF NOT EXISTS "indTraslado" varchar(1) NOT NULL DEFAULT '1'`,
    );
    await queryRunner.query(
      `ALTER TABLE "DispatchGuide"
       ADD COLUMN IF NOT EXISTS "includePrices" boolean NOT NULL DEFAULT true`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "DispatchGuideReferenceItem" (
        "dispatchGuideReferenceItemID" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantID" uuid NOT NULL,
        "dispatchGuideReferenceID" uuid NOT NULL REFERENCES "DispatchGuideReference"("dispatchGuideReferenceID") ON DELETE CASCADE,
        "dispatchGuideID" uuid NOT NULL REFERENCES "DispatchGuide"("dispatchGuideID") ON DELETE CASCADE,
        "variationID" uuid NOT NULL,
        "quantity" integer NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "dispatch_guide_reference_item_tenant_reference_idx"
       ON "DispatchGuideReferenceItem" ("tenantID", "dispatchGuideReferenceID")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "dispatch_guide_reference_item_tenant_guide_idx"
       ON "DispatchGuideReferenceItem" ("tenantID", "dispatchGuideID")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "dispatch_guide_reference_item_tenant_pk_idx"
       ON "DispatchGuideReferenceItem" ("tenantID", "dispatchGuideReferenceItemID")`,
    );
    await this.enableRls(queryRunner, 'DispatchGuideReferenceItem');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP POLICY IF EXISTS tenant_isolation_select ON "DispatchGuideReferenceItem"`,
    );
    await queryRunner.query(
      `DROP POLICY IF EXISTS tenant_isolation_write ON "DispatchGuideReferenceItem"`,
    );
    await queryRunner.query(
      `ALTER TABLE "DispatchGuideReferenceItem" DISABLE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "DispatchGuideReferenceItem"`,
    );
    await queryRunner.query(
      `ALTER TABLE "DispatchGuide" DROP COLUMN IF EXISTS "includePrices"`,
    );
    await queryRunner.query(
      `ALTER TABLE "DispatchGuide" DROP COLUMN IF EXISTS "indTraslado"`,
    );

    await queryRunner.query(
      `ALTER TABLE "DispatchGuide" ALTER COLUMN "status" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "DispatchGuide" ALTER COLUMN "status" TYPE text USING "status"::text`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "DispatchGuide_status_enum"`);
    await queryRunner.query(
      `CREATE TYPE "DispatchGuide_status_enum" AS ENUM ('PENDIENTE', 'EMITIDA', 'ANULADA')`,
    );
    await queryRunner.query(
      `ALTER TABLE "DispatchGuide" ALTER COLUMN "status" TYPE "DispatchGuide_status_enum" USING "status"::"DispatchGuide_status_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "DispatchGuide" ALTER COLUMN "status" SET DEFAULT 'PENDIENTE'`,
    );
    await queryRunner.query(
      `GRANT USAGE ON TYPE "DispatchGuide_status_enum" TO app_runtime`,
    );
  }
}
