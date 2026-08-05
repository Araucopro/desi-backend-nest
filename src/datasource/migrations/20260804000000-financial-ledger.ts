import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ledger financiero (devengo) para el estado de resultados F29.
 *
 * - DteDocument: separa neto/IVA en columnas y congela el costo de venta (COGS).
 * - PurchaseOrder: guarda paidAt para usar como fecha fiscal del movimiento.
 * - Expense: separa neto/IVA, deducibilidad Art. 31 y derecho a crédito fiscal.
 * - FinancialMovement: proyección derivada (upsert/delete) que alimenta el reporte.
 *
 * Sin backfill: los registros previos no generan movimientos.
 */
export class FinancialLedger20260804000000 implements MigrationInterface {
  name = 'FinancialLedger20260804000000';

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

  async up(queryRunner: QueryRunner): Promise<void> {
    if (await this.tableExists(queryRunner, 'DteDocument')) {
      await queryRunner.query(
        `ALTER TABLE "DteDocument" ADD COLUMN IF NOT EXISTS "netTotal" decimal(12,2) NOT NULL DEFAULT 0`,
      );
      await queryRunner.query(
        `ALTER TABLE "DteDocument" ADD COLUMN IF NOT EXISTS "taxTotal" decimal(12,2) NOT NULL DEFAULT 0`,
      );
      await queryRunner.query(
        `ALTER TABLE "DteDocument" ADD COLUMN IF NOT EXISTS "cogsTotal" decimal(12,2) NOT NULL DEFAULT 0`,
      );
      await queryRunner.query(
        `ALTER TABLE "DteDocument" ADD COLUMN IF NOT EXISTS "issueDate" date NOT NULL DEFAULT CURRENT_DATE`,
      );
    }

    if (await this.tableExists(queryRunner, 'PurchaseOrder')) {
      await queryRunner.query(
        `ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "paidAt" timestamptz NULL`,
      );
    }

    if (await this.tableExists(queryRunner, 'Expense')) {
      await queryRunner.query(
        `ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "netAmount" decimal(12,2) NOT NULL DEFAULT 0`,
      );
      await queryRunner.query(
        `ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "taxAmount" decimal(12,2) NOT NULL DEFAULT 0`,
      );
      await queryRunner.query(
        `ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "acceptedForTax" boolean NOT NULL DEFAULT true`,
      );
      await queryRunner.query(
        `ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "taxCredit" boolean NOT NULL DEFAULT true`,
      );
      await queryRunner.query(
        `ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "supportDocument" varchar(255) NULL`,
      );
    }

    await this.createEnumType(queryRunner, 'FinancialMovement_direction_enum', [
      'INGRESO',
      'EGRESO',
    ]);
    await this.createEnumType(queryRunner, 'FinancialMovement_category_enum', [
      'VENTA',
      'COSTO_VENTA',
      'COMPRA',
      'GASTO_OPERACIONAL',
      'GASTO_ADMINISTRATIVO',
      'GASTO_FINANCIERO',
    ]);
    await this.createEnumType(
      queryRunner,
      'FinancialMovement_sourceType_enum',
      ['DTE_DOCUMENT', 'PURCHASE_ORDER', 'EXPENSE'],
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "FinancialMovement" (
        "financialMovementID" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantID" uuid NOT NULL,
        "storeID" uuid NOT NULL,
        "date" date NOT NULL,
        "direction" "FinancialMovement_direction_enum" NOT NULL,
        "category" "FinancialMovement_category_enum" NOT NULL,
        "amount" decimal(12,2) NOT NULL,
        "taxAmount" decimal(12,2) NOT NULL DEFAULT 0,
        "taxCredit" boolean NOT NULL DEFAULT false,
        "acceptedForTax" boolean NOT NULL DEFAULT true,
        "sourceType" "FinancialMovement_sourceType_enum" NOT NULL,
        "sourceID" uuid NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "financial_movement_tenant_date_idx"
       ON "FinancialMovement" ("tenantID", "date")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "financial_movement_tenant_store_date_idx"
       ON "FinancialMovement" ("tenantID", "storeID", "date")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "financial_movement_source_uq"
       ON "FinancialMovement" ("tenantID", "sourceType", "sourceID", "category")`,
    );

    await queryRunner.query(
      `ALTER TABLE "FinancialMovement" ENABLE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `ALTER TABLE "FinancialMovement" FORCE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `DROP POLICY IF EXISTS tenant_isolation_select ON "FinancialMovement"`,
    );
    await queryRunner.query(
      `CREATE POLICY tenant_isolation_select ON "FinancialMovement"
       FOR SELECT USING ("tenantID" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)`,
    );
    await queryRunner.query(
      `DROP POLICY IF EXISTS tenant_isolation_write ON "FinancialMovement"`,
    );
    await queryRunner.query(
      `CREATE POLICY tenant_isolation_write ON "FinancialMovement"
       USING ("tenantID" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
       WITH CHECK ("tenantID" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)`,
    );
    await queryRunner.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "FinancialMovement" TO app_runtime`,
    );
    await queryRunner.query(
      `GRANT USAGE ON TYPE "FinancialMovement_direction_enum",
       "FinancialMovement_category_enum", "FinancialMovement_sourceType_enum" TO app_runtime`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP POLICY IF EXISTS tenant_isolation_select ON "FinancialMovement"`,
    );
    await queryRunner.query(
      `DROP POLICY IF EXISTS tenant_isolation_write ON "FinancialMovement"`,
    );
    await queryRunner.query(
      `ALTER TABLE "FinancialMovement" DISABLE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "FinancialMovement"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "FinancialMovement_direction_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "FinancialMovement_category_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "FinancialMovement_sourceType_enum"`,
    );

    if (await this.tableExists(queryRunner, 'DteDocument')) {
      await queryRunner.query(
        `ALTER TABLE "DteDocument" DROP COLUMN IF EXISTS "issueDate"`,
      );
      await queryRunner.query(
        `ALTER TABLE "DteDocument" DROP COLUMN IF EXISTS "cogsTotal"`,
      );
      await queryRunner.query(
        `ALTER TABLE "DteDocument" DROP COLUMN IF EXISTS "taxTotal"`,
      );
      await queryRunner.query(
        `ALTER TABLE "DteDocument" DROP COLUMN IF EXISTS "netTotal"`,
      );
    }

    if (await this.tableExists(queryRunner, 'PurchaseOrder')) {
      await queryRunner.query(
        `ALTER TABLE "PurchaseOrder" DROP COLUMN IF EXISTS "paidAt"`,
      );
    }

    if (await this.tableExists(queryRunner, 'Expense')) {
      await queryRunner.query(
        `ALTER TABLE "Expense" DROP COLUMN IF EXISTS "supportDocument"`,
      );
      await queryRunner.query(
        `ALTER TABLE "Expense" DROP COLUMN IF EXISTS "taxCredit"`,
      );
      await queryRunner.query(
        `ALTER TABLE "Expense" DROP COLUMN IF EXISTS "acceptedForTax"`,
      );
      await queryRunner.query(
        `ALTER TABLE "Expense" DROP COLUMN IF EXISTS "taxAmount"`,
      );
      await queryRunner.query(
        `ALTER TABLE "Expense" DROP COLUMN IF EXISTS "netAmount"`,
      );
    }
  }
}
