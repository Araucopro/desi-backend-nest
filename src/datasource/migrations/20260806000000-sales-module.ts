import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Módulo de ventas (boleta, factura y nota de venta).
 *
 * - Crea Sale, SaleItem y SaleFolioCounter con RLS y índices compuestos
 *   (tenantID, pk) consistentes con el resto de tablas comerciales.
 * - Agrega saleID (único nullable) a DteDocument para trazabilidad de la
 *   conversión nota de venta -> DTE y stockReserved para saber si el DTE
 *   reservó stock o si el stock ya salió con la nota de venta.
 * - Agrega SALE_NOTE al enum de fuente del ledger financiero.
 */
export class SalesModule20260806000000 implements MigrationInterface {
  name = 'SalesModule20260806000000';

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
    await this.createEnumType(queryRunner, 'Sale_saleType_enum', [
      'BOLETA',
      'FACTURA',
      'NOTA_VENTA',
    ]);
    await this.createEnumType(queryRunner, 'Sale_status_enum', [
      'EMITIDA',
      'CONVERTIDA',
    ]);
    await this.createEnumType(queryRunner, 'Sale_paymentType_enum', [
      'Efectivo',
      'Debito',
      'Credito',
    ]);

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "Sale" (
        "saleID" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantID" uuid NOT NULL,
        "storeID" uuid NOT NULL,
        "userID" uuid NULL,
        "saleType" "Sale_saleType_enum" NOT NULL,
        "status" "Sale_status_enum" NOT NULL DEFAULT 'EMITIDA',
        "paymentType" "Sale_paymentType_enum" NOT NULL,
        "folio" integer NULL,
        "issueDate" date NOT NULL DEFAULT CURRENT_DATE,
        "receiver" jsonb NULL,
        "subtotal" decimal(12,2) NOT NULL DEFAULT 0,
        "discount" decimal(12,2) NOT NULL DEFAULT 0,
        "netTotal" decimal(12,2) NOT NULL DEFAULT 0,
        "taxTotal" decimal(12,2) NOT NULL DEFAULT 0,
        "total" decimal(12,2) NOT NULL DEFAULT 0,
        "cogsTotal" decimal(12,2) NOT NULL DEFAULT 0,
        "dteDocumentID" uuid NULL,
        "idempotencyKey" varchar(128) NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "sale_dte_document_id_uq"
       ON "Sale" ("dteDocumentID")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "sale_idempotency_key_uq"
       ON "Sale" ("idempotencyKey")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "sale_tenant_pk_idx"
       ON "Sale" ("tenantID", "saleID")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "sale_tenant_store_created_idx"
       ON "Sale" ("tenantID", "storeID", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "sale_tenant_status_idx"
       ON "Sale" ("tenantID", "status")`,
    );
    await this.enableRls(queryRunner, 'Sale');

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "SaleItem" (
        "saleItemID" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantID" uuid NOT NULL,
        "saleID" uuid NOT NULL REFERENCES "Sale"("saleID") ON DELETE CASCADE,
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
      `CREATE INDEX IF NOT EXISTS "sale_item_tenant_sale_idx"
       ON "SaleItem" ("tenantID", "saleID")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "sale_item_tenant_pk_idx"
       ON "SaleItem" ("tenantID", "saleItemID")`,
    );
    await this.enableRls(queryRunner, 'SaleItem');

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "SaleFolioCounter" (
        "saleFolioCounterID" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantID" uuid NOT NULL,
        "storeID" uuid NOT NULL,
        "currentFolio" integer NOT NULL DEFAULT 0,
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "sale_folio_tenant_store_uq"
       ON "SaleFolioCounter" ("tenantID", "storeID")`,
    );
    await this.enableRls(queryRunner, 'SaleFolioCounter');

    await queryRunner.query(
      `GRANT USAGE ON TYPE "Sale_saleType_enum", "Sale_status_enum",
       "Sale_paymentType_enum" TO app_runtime`,
    );

    if (await this.tableExists(queryRunner, 'DteDocument')) {
      await queryRunner.query(
        `ALTER TABLE "DteDocument" ADD COLUMN IF NOT EXISTS "saleID" uuid NULL`,
      );
      await queryRunner.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS "dte_document_sale_id_uq"
         ON "DteDocument" ("saleID")`,
      );
      await queryRunner.query(
        `ALTER TABLE "DteDocument" ADD COLUMN IF NOT EXISTS "stockReserved" boolean NOT NULL DEFAULT true`,
      );
    }

    await queryRunner.query(
      `ALTER TYPE "FinancialMovement_sourceType_enum" ADD VALUE IF NOT EXISTS 'SALE_NOTE'`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['SaleFolioCounter', 'SaleItem', 'Sale']) {
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
    await queryRunner.query(`DROP TABLE IF EXISTS "SaleFolioCounter"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "SaleItem"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "Sale"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "Sale_paymentType_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "Sale_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "Sale_saleType_enum"`);

    if (await this.tableExists(queryRunner, 'DteDocument')) {
      await queryRunner.query(`DROP INDEX IF EXISTS "dte_document_sale_id_uq"`);
      await queryRunner.query(
        `ALTER TABLE "DteDocument" DROP COLUMN IF EXISTS "saleID"`,
      );
      await queryRunner.query(
        `ALTER TABLE "DteDocument" DROP COLUMN IF EXISTS "stockReserved"`,
      );
    }
  }
}
