import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ofertas BUNDLE por StoreProduct.
 *
 * Agrega `allowBelowMargin` a SpecialOffer para permitir que una oferta
 * regale unidades (BUNDLE u otras) sin que la validación de margen por línea
 * bloquee la venta, y agrega `storeProductID` a SpecialOfferBundleItem para
 * matchear el bundle a nivel variación/tienda. `productID` queda nullable
 * para conservar filas legacy sin romper el contrato.
 */
export class OfferBundleStoreProduct20260818000200 implements MigrationInterface {
  name = 'OfferBundleStoreProduct20260818000200';

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

  async up(queryRunner: QueryRunner): Promise<void> {
    if (await this.tableExists(queryRunner, 'SpecialOffer')) {
      await queryRunner.query(
        `ALTER TABLE "SpecialOffer"
         ADD COLUMN IF NOT EXISTS "allowBelowMargin" boolean NOT NULL DEFAULT false`,
      );
    }

    if (await this.tableExists(queryRunner, 'SpecialOfferBundleItem')) {
      await queryRunner.query(
        `ALTER TABLE "SpecialOfferBundleItem"
         ADD COLUMN IF NOT EXISTS "storeProductID" uuid NULL`,
      );
      await queryRunner.query(
        `ALTER TABLE "SpecialOfferBundleItem"
         ALTER COLUMN "productID" DROP NOT NULL`,
      );
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "special_offer_bundle_tenant_store_product_idx"
         ON "SpecialOfferBundleItem" ("tenantID", "storeProductID")`,
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "special_offer_bundle_tenant_store_product_idx"`,
    );
    if (await this.tableExists(queryRunner, 'SpecialOfferBundleItem')) {
      await queryRunner.query(
        `ALTER TABLE "SpecialOfferBundleItem"
         DROP COLUMN IF EXISTS "storeProductID"`,
      );
      // "productID" se conserva nullable porque pueden existir filas legacy
      // con storeProductID y sin productID derivado.
    }
    if (await this.tableExists(queryRunner, 'SpecialOffer')) {
      await queryRunner.query(
        `ALTER TABLE "SpecialOffer"
         DROP COLUMN IF EXISTS "allowBelowMargin"`,
      );
    }
  }
}
