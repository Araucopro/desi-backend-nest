import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Módulo de devoluciones (NCE + reintegro de inventario).
 *
 * - Crea Return, ReturnItem y ReturnFolioCounter con RLS e índices
 *   compuestos (tenantID, pk), (tenantID, saleID) y (tenantID, status).
 * - Agrega RETURN a InventoryMovements_reason_enum y
 *   FinancialMovement_sourceType_enum.
 */
export class ReturnsModule20260825000000 implements MigrationInterface {
  name = 'ReturnsModule20260825000000';

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
    await this.createEnumType(queryRunner, 'Return_returnType_enum', [
      'TOTAL',
      'PARCIAL',
      'DESCUENTO',
    ]);
    await this.createEnumType(queryRunner, 'Return_status_enum', [
      'PENDIENTE',
      'APROBADA',
      'COMPLETADA',
      'RECHAZADA',
      'CANCELADA',
    ]);

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "Return" (
        "returnID" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantID" uuid NOT NULL,
        "storeID" uuid NOT NULL,
        "saleID" uuid NOT NULL REFERENCES "Sale"("saleID") ON DELETE CASCADE,
        "returnType" "Return_returnType_enum" NOT NULL,
        "status" "Return_status_enum" NOT NULL DEFAULT 'PENDIENTE',
        "reason" text NULL,
        "discountAmount" decimal(12,2) NOT NULL DEFAULT 0,
        "folio" integer NULL,
        "dteDocumentID" uuid NULL,
        "issueDate" date NOT NULL DEFAULT CURRENT_DATE,
        "subtotal" decimal(12,2) NOT NULL DEFAULT 0,
        "netTotal" decimal(12,2) NOT NULL DEFAULT 0,
        "taxTotal" decimal(12,2) NOT NULL DEFAULT 0,
        "total" decimal(12,2) NOT NULL DEFAULT 0,
        "cogsTotal" decimal(12,2) NOT NULL DEFAULT 0,
        "userID" uuid NULL,
        "approvedBy" uuid NULL,
        "approvedAt" timestamptz NULL,
        "completedAt" timestamptz NULL,
        "idempotencyKey" varchar(128) NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "return_dte_document_id_uq"
       ON "Return" ("dteDocumentID")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "return_idempotency_key_uq"
       ON "Return" ("idempotencyKey")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "return_tenant_pk_idx"
       ON "Return" ("tenantID", "returnID")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "return_tenant_store_created_idx"
       ON "Return" ("tenantID", "storeID", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "return_tenant_sale_idx"
       ON "Return" ("tenantID", "saleID")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "return_tenant_status_idx"
       ON "Return" ("tenantID", "status")`,
    );
    await this.enableRls(queryRunner, 'Return');

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "ReturnItem" (
        "returnItemID" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantID" uuid NOT NULL,
        "returnID" uuid NOT NULL REFERENCES "Return"("returnID") ON DELETE CASCADE,
        "saleItemID" uuid NOT NULL REFERENCES "SaleItem"("saleItemID") ON DELETE CASCADE,
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
      `CREATE INDEX IF NOT EXISTS "return_item_tenant_return_idx"
       ON "ReturnItem" ("tenantID", "returnID")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "return_item_tenant_pk_idx"
       ON "ReturnItem" ("tenantID", "returnItemID")`,
    );
    await this.enableRls(queryRunner, 'ReturnItem');

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "ReturnFolioCounter" (
        "returnFolioCounterID" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantID" uuid NOT NULL,
        "storeID" uuid NOT NULL,
        "currentFolio" integer NOT NULL DEFAULT 0,
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "return_folio_tenant_store_uq"
       ON "ReturnFolioCounter" ("tenantID", "storeID")`,
    );
    await this.enableRls(queryRunner, 'ReturnFolioCounter');

    await queryRunner.query(
      `GRANT USAGE ON TYPE "Return_returnType_enum", "Return_status_enum" TO app_runtime`,
    );

    if (await this.tableExists(queryRunner, 'InventoryMovements')) {
      await queryRunner.query(
        `ALTER TYPE "InventoryMovements_reason_enum" ADD VALUE IF NOT EXISTS 'RETURN'`,
      );
    }
    if (await this.tableExists(queryRunner, 'FinancialMovement')) {
      await queryRunner.query(
        `ALTER TYPE "FinancialMovement_sourceType_enum" ADD VALUE IF NOT EXISTS 'RETURN'`,
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['ReturnFolioCounter', 'ReturnItem', 'Return']) {
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
    await queryRunner.query(`DROP TABLE IF EXISTS "ReturnFolioCounter"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ReturnItem"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "Return"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "Return_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "Return_returnType_enum"`);
  }
}
