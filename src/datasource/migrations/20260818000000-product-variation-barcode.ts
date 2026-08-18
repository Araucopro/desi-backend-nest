import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agrega barcode a ProductVariations (EAN/UPC) y lo backfillea con
 * supplierSku o sku para que el catalogo existente sea escaneable de inmediato.
 */
export class AddProductVariationBarcode20260818000000 implements MigrationInterface {
  name = 'AddProductVariationBarcode20260818000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const exists = await queryRunner.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'ProductVariations'`,
    );
    if (exists && (exists as unknown[]).length > 0) {
      await queryRunner.query(
        `ALTER TABLE "ProductVariations" ADD COLUMN IF NOT EXISTS "barcode" character varying(255)`,
      );
      await queryRunner.query(
        `UPDATE "ProductVariations"
         SET "barcode" = COALESCE(NULLIF("supplierSku", ''), "sku")
         WHERE "barcode" IS NULL OR "barcode" = ''`,
      );
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "product_variations_tenant_barcode_idx"
         ON "ProductVariations" ("tenantID", "barcode")`,
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "product_variations_tenant_barcode_idx"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ProductVariations" DROP COLUMN IF EXISTS "barcode"`,
    );
  }
}
