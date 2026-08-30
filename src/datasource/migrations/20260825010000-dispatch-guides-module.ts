import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Módulo de Guías de Despacho (DTE 52).
 *
 * - Crea DispatchGuide, DispatchGuideItem y DispatchGuideReference con RLS,
 *   índices compuestos (tenantID, pk), (tenantID, storeID, createdAt) y
 *   (tenantID, status), únicos en dteDocumentID e idempotencyKey.
 * - Agrega DISPATCH_GUIDE a InventoryMovements_reason_enum.
 */
export class DispatchGuidesModule20260825010000 implements MigrationInterface {
  name = 'DispatchGuidesModule20260825010000';

  private async tableExists(
    queryRunner: QueryRunner,
    table: string,
  ): Promise<boolean> {
    const rows = await queryRunner.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1`,
      [table],
    );
    return Array.isArray(rows) && rows.length > 0;
  }

  private async createEnumType(
    queryRunner: QueryRunner,
    typeName: string,
    values: string[],
  ): Promise<void> {
    await queryRunner.query(
      `DO $$ BEGIN
         CREATE TYPE "${typeName}" AS ENUM (${values
           .map((value) => `'${value}'`)
           .join(', ')});
       EXCEPTION WHEN duplicate_object THEN NULL;
       END $$;`,
    );
  }

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
    await this.createEnumType(queryRunner, 'DispatchGuide_status_enum', [
      'PENDIENTE',
      'EMITIDA',
      'ANULADA',
    ]);

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "DispatchGuide" (
        "dispatchGuideID" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantID" uuid NOT NULL,
        "storeID" uuid NOT NULL,
        "userID" uuid NULL,
        "status" "DispatchGuide_status_enum" NOT NULL DEFAULT 'PENDIENTE',
        "folio" integer NULL,
        "dteDocumentID" uuid NULL,
        "idempotencyKey" varchar(128) NULL,
        "issueDate" date NOT NULL DEFAULT CURRENT_DATE,
        "receiver" jsonb NOT NULL,
        "destination" jsonb NOT NULL,
        "transport" jsonb NULL,
        "subtotal" decimal(12,2) NOT NULL DEFAULT 0,
        "discount" decimal(12,2) NOT NULL DEFAULT 0,
        "netTotal" decimal(12,2) NOT NULL DEFAULT 0,
        "taxTotal" decimal(12,2) NOT NULL DEFAULT 0,
        "total" decimal(12,2) NOT NULL DEFAULT 0,
        "cogsTotal" decimal(12,2) NOT NULL DEFAULT 0,
        "payloadRaw" jsonb NULL,
        "errorDetail" text NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "dispatch_guide_dte_document_id_uq"
       ON "DispatchGuide" ("dteDocumentID")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "dispatch_guide_idempotency_key_uq"
       ON "DispatchGuide" ("idempotencyKey")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "dispatch_guide_tenant_pk_idx"
       ON "DispatchGuide" ("tenantID", "dispatchGuideID")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "dispatch_guide_tenant_store_created_idx"
       ON "DispatchGuide" ("tenantID", "storeID", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "dispatch_guide_tenant_status_idx"
       ON "DispatchGuide" ("tenantID", "status")`,
    );
    await this.enableRls(queryRunner, 'DispatchGuide');

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "DispatchGuideItem" (
        "dispatchGuideItemID" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantID" uuid NOT NULL,
        "dispatchGuideID" uuid NOT NULL REFERENCES "DispatchGuide"("dispatchGuideID") ON DELETE CASCADE,
        "storeProductID" uuid NOT NULL,
        "variationID" uuid NOT NULL,
        "productName" varchar(255) NOT NULL,
        "sku" varchar(255) NOT NULL,
        "quantity" integer NOT NULL,
        "unitPrice" decimal(10,2) NOT NULL,
        "unitCost" decimal(10,2) NOT NULL DEFAULT 0,
        "lineTotal" decimal(12,2) NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "dispatch_guide_item_tenant_guide_idx"
       ON "DispatchGuideItem" ("tenantID", "dispatchGuideID")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "dispatch_guide_item_tenant_pk_idx"
       ON "DispatchGuideItem" ("tenantID", "dispatchGuideItemID")`,
    );
    await this.enableRls(queryRunner, 'DispatchGuideItem');

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "DispatchGuideReference" (
        "dispatchGuideReferenceID" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantID" uuid NOT NULL,
        "dispatchGuideID" uuid NOT NULL REFERENCES "DispatchGuide"("dispatchGuideID") ON DELETE CASCADE,
        "dteDocumentID" uuid NOT NULL REFERENCES "DteDocument"("dteDocumentID") ON DELETE CASCADE,
        "saleID" uuid NULL REFERENCES "Sale"("saleID") ON DELETE SET NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "dispatch_guide_reference_guide_dte_uq"
       ON "DispatchGuideReference" ("dispatchGuideID", "dteDocumentID")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "dispatch_guide_reference_tenant_pk_idx"
       ON "DispatchGuideReference" ("tenantID", "dispatchGuideReferenceID")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "dispatch_guide_reference_tenant_guide_idx"
       ON "DispatchGuideReference" ("tenantID", "dispatchGuideID")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "dispatch_guide_reference_tenant_dte_idx"
       ON "DispatchGuideReference" ("tenantID", "dteDocumentID")`,
    );
    await this.enableRls(queryRunner, 'DispatchGuideReference');

    await queryRunner.query(
      `GRANT USAGE ON TYPE "DispatchGuide_status_enum" TO app_runtime`,
    );

    if (await this.tableExists(queryRunner, 'InventoryMovements')) {
      await queryRunner.query(
        `ALTER TYPE "InventoryMovements_reason_enum" ADD VALUE IF NOT EXISTS 'DISPATCH_GUIDE'`,
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of [
      'DispatchGuideReference',
      'DispatchGuideItem',
      'DispatchGuide',
    ]) {
      await queryRunner.query(
        `DROP POLICY IF EXISTS tenant_isolation_select ON "${table}"`,
      );
      await queryRunner.query(
        `DROP POLICY IF EXISTS tenant_isolation_write ON "${table}"`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" DISABLE ROW LEVEL SECURITY`,
      );
    }
    await queryRunner.query(`DROP TABLE IF EXISTS "DispatchGuideReference"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "DispatchGuideItem"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "DispatchGuide"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "DispatchGuide_status_enum"`);
  }
}
