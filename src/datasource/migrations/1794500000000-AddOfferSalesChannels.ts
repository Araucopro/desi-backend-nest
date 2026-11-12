import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOfferSalesChannels1794500000000 implements MigrationInterface {
  name = 'AddOfferSalesChannels1794500000000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "SpecialOffer"
      ADD COLUMN "salesChannels" text[] NOT NULL DEFAULT ARRAY['PHYSICAL','ONLINE']::text[],
      ADD COLUMN "storeIDs" uuid[] NOT NULL DEFAULT '{}'::uuid[],
      ADD CONSTRAINT "CHK_offer_sales_channels" CHECK (cardinality("salesChannels") > 0 AND "salesChannels" <@ ARRAY['PHYSICAL','ONLINE']::text[])`);
    await queryRunner.query(
      'CREATE INDEX "IDX_offer_store_ids" ON "SpecialOffer" USING GIN ("storeIDs")',
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "IDX_offer_store_ids"');
    await queryRunner.query(
      'ALTER TABLE "SpecialOffer" DROP CONSTRAINT "CHK_offer_sales_channels", DROP COLUMN "salesChannels", DROP COLUMN "storeIDs"',
    );
  }
}
