import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Añade campos DTE a la tabla Store (giro, acteco, cdgSIISucur, businessName)
 * y supplierSku a la tabla ProductVariations.
 */
export class AddDteStoreFieldsAndSupplierSku20260728000500 implements MigrationInterface {
  name = 'AddDteStoreFieldsAndSupplierSku20260728000500';

  async up(queryRunner: QueryRunner): Promise<void> {
    const storeExists = await queryRunner.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'Store'`,
    );
    if (storeExists && (storeExists as unknown[]).length > 0) {
      await queryRunner.query(
        `ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "giro" character varying(255)`,
      );
      await queryRunner.query(
        `ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "acteco" character varying(255)`,
      );
      await queryRunner.query(
        `ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "cdgSIISucur" character varying(64)`,
      );
      await queryRunner.query(
        `ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "businessName" character varying(255)`,
      );
    }

    const varExists = await queryRunner.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'ProductVariations'`,
    );
    if (varExists && (varExists as unknown[]).length > 0) {
      await queryRunner.query(
        `ALTER TABLE "ProductVariations" ADD COLUMN IF NOT EXISTS "supplierSku" character varying(255)`,
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ProductVariations" DROP COLUMN IF EXISTS "supplierSku"`,
    );
    await queryRunner.query(
      `ALTER TABLE "Store" DROP COLUMN IF EXISTS "businessName"`,
    );
    await queryRunner.query(
      `ALTER TABLE "Store" DROP COLUMN IF EXISTS "cdgSIISucur"`,
    );
    await queryRunner.query(
      `ALTER TABLE "Store" DROP COLUMN IF EXISTS "acteco"`,
    );
    await queryRunner.query(`ALTER TABLE "Store" DROP COLUMN IF EXISTS "giro"`);
  }
}
