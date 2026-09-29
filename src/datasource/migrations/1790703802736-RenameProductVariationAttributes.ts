import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameProductVariationAttributes1790703802736 implements MigrationInterface {
  name = 'RenameProductVariationAttributes1790703802736';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ProductVariations" RENAME COLUMN "size" TO "variation"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ProductVariations" RENAME COLUMN "color" TO "subVariation"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ProductVariations" RENAME COLUMN "subVariation" TO "color"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ProductVariations" RENAME COLUMN "variation" TO "size"`,
    );
  }
}
