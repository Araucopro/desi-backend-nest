import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Motor de descuentos v2.
 *
 * Extiende SpecialOffer con alcances por tienda, producto(s), categoría,
 * marca y modelo; agrega tipos BUY_X_GET_Y (2x1, 3x2, 6x5) y BUNDLE; y crea
 * las tablas auxiliares SpecialOfferProduct / SpecialOfferBundleItem con RLS.
 */
export class DiscountEngineV220260812000000 implements MigrationInterface {
  name = 'DiscountEngineV220260812000000';

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

  private async columnExists(
    queryRunner: QueryRunner,
    table: string,
    column: string,
  ): Promise<boolean> {
    const rows = await queryRunner.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
      [table, column],
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

  private async resolveOfferTable(
    queryRunner: QueryRunner,
  ): Promise<string | null> {
    const candidates = ['SpecialOffer', 'special_offers', 'special_offer'];
    for (const candidate of candidates) {
      if (await this.tableExists(queryRunner, candidate)) return candidate;
    }
    return null;
  }

  private async addValueToDiscountEnums(
    queryRunner: QueryRunner,
  ): Promise<void> {
    const rows = await queryRunner.query(
      `SELECT t.typname
       FROM pg_type t
       JOIN pg_namespace n ON n.oid = t.typnamespace
       WHERE n.nspname = 'public'
         AND t.typtype = 'e'
         AND (
           t.typname ILIKE 'special%offer%discount%'
           OR t.typname ILIKE '%discount_type%'
         )`,
    );
    const typeNames = (rows as Array<{ typname: string }>).map(
      (row) => row.typname,
    );
    for (const typeName of typeNames) {
      await queryRunner.query(
        `ALTER TYPE "${typeName}" ADD VALUE IF NOT EXISTS 'BUY_X_GET_Y'`,
      );
      await queryRunner.query(
        `ALTER TYPE "${typeName}" ADD VALUE IF NOT EXISTS 'BUNDLE'`,
      );
      await queryRunner.query(
        `GRANT USAGE ON TYPE "${typeName}" TO app_runtime`,
      );
    }
  }

  private async grantEnumUsage(
    queryRunner: QueryRunner,
    typeNames: string[],
  ): Promise<void> {
    for (const typeName of typeNames) {
      await queryRunner.query(
        `GRANT USAGE ON TYPE "${typeName}" TO app_runtime`,
      );
    }
  }

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

    const offerTable = await this.resolveOfferTable(queryRunner);
    if (offerTable) {
      const discountEnum = `${offerTable}_discountType_enum`;
      const targetEnum = `${offerTable}_targetScope_enum`;
      await this.createEnumType(queryRunner, discountEnum, [
        'PERCENTAGE',
        'FIXED_AMOUNT',
        'FIXED_PRICE',
        'BUY_X_GET_Y',
        'BUNDLE',
      ]);
      await this.createEnumType(queryRunner, targetEnum, [
        'VARIATION',
        'STORE',
        'PRODUCT',
        'CATEGORY',
        'BRAND',
        'MODEL',
      ]);

      await queryRunner.query(
        `ALTER TABLE "${offerTable}"
         ADD COLUMN IF NOT EXISTS "targetScope" "${targetEnum}"
           NOT NULL DEFAULT 'VARIATION'`,
      );
      await queryRunner.query(
        `ALTER TABLE "${offerTable}" ADD COLUMN IF NOT EXISTS "storeID" uuid NULL`,
      );
      await queryRunner.query(
        `ALTER TABLE "${offerTable}" ADD COLUMN IF NOT EXISTS "productID" uuid NULL`,
      );
      await queryRunner.query(
        `ALTER TABLE "${offerTable}" ADD COLUMN IF NOT EXISTS "categoryID" uuid NULL`,
      );
      await queryRunner.query(
        `ALTER TABLE "${offerTable}" ADD COLUMN IF NOT EXISTS "includeSubcategories" boolean NOT NULL DEFAULT true`,
      );
      await queryRunner.query(
        `ALTER TABLE "${offerTable}" ADD COLUMN IF NOT EXISTS "brand" varchar(255) NULL`,
      );
      await queryRunner.query(
        `ALTER TABLE "${offerTable}" ADD COLUMN IF NOT EXISTS "model" varchar(255) NULL`,
      );
      await queryRunner.query(
        `ALTER TABLE "${offerTable}" ADD COLUMN IF NOT EXISTS "buyQuantity" integer NULL`,
      );
      await queryRunner.query(
        `ALTER TABLE "${offerTable}" ADD COLUMN IF NOT EXISTS "payQuantity" integer NULL`,
      );
      await queryRunner.query(
        `ALTER TABLE "${offerTable}" ADD COLUMN IF NOT EXISTS "priority" integer NOT NULL DEFAULT 0`,
      );

      if (await this.columnExists(queryRunner, offerTable, 'storeProductID')) {
        await queryRunner.query(
          `ALTER TABLE "${offerTable}" ALTER COLUMN "storeProductID" DROP NOT NULL`,
        );
      }

      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "special_offer_tenant_store_idx"
         ON "${offerTable}" ("tenantID", "storeID")`,
      );
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "special_offer_tenant_category_idx"
         ON "${offerTable}" ("tenantID", "categoryID")`,
      );

      await this.addValueToDiscountEnums(queryRunner);
      await this.grantEnumUsage(queryRunner, [discountEnum, targetEnum]);
    }

    const offerTableRef = offerTable ?? 'SpecialOffer';
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "SpecialOfferProduct" (
        "specialOfferProductID" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantID" uuid NOT NULL,
        "offerID" uuid NOT NULL REFERENCES "${offerTableRef}"("offerID") ON DELETE CASCADE,
        "productID" uuid NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "special_offer_product_tenant_pk_idx"
       ON "SpecialOfferProduct" ("tenantID", "specialOfferProductID")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "special_offer_product_tenant_offer_idx"
       ON "SpecialOfferProduct" ("tenantID", "offerID")`,
    );
    await this.enableRls(queryRunner, 'SpecialOfferProduct');

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "SpecialOfferBundleItem" (
        "specialOfferBundleItemID" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantID" uuid NOT NULL,
        "offerID" uuid NOT NULL REFERENCES "${offerTableRef}"("offerID") ON DELETE CASCADE,
        "productID" uuid NOT NULL,
        "requiredQuantity" integer NOT NULL DEFAULT 1,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "special_offer_bundle_tenant_pk_idx"
       ON "SpecialOfferBundleItem" ("tenantID", "specialOfferBundleItemID")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "special_offer_bundle_tenant_offer_idx"
       ON "SpecialOfferBundleItem" ("tenantID", "offerID")`,
    );
    await this.enableRls(queryRunner, 'SpecialOfferBundleItem');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['SpecialOfferProduct', 'SpecialOfferBundleItem']) {
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
    await queryRunner.query(`DROP TABLE IF EXISTS "SpecialOfferBundleItem"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "SpecialOfferProduct"`);

    const offerTable = await this.resolveOfferTable(queryRunner);
    if (!offerTable) return;
    const columns = [
      'targetScope',
      'storeID',
      'productID',
      'categoryID',
      'includeSubcategories',
      'brand',
      'model',
      'buyQuantity',
      'payQuantity',
      'priority',
    ];
    for (const column of columns) {
      await queryRunner.query(
        `ALTER TABLE "${offerTable}" DROP COLUMN IF EXISTS "${column}"`,
      );
    }
    await queryRunner.query(
      `DROP INDEX IF EXISTS "special_offer_tenant_store_idx"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "special_offer_tenant_category_idx"`,
    );
  }
}
