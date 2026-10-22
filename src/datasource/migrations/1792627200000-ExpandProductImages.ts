import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExpandProductImages1792627200000 implements MigrationInterface {
  name = 'ExpandProductImages1792627200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "Products" ALTER COLUMN "image" TYPE text',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Refuse rollback rather than silently truncate a gallery longer than 255 characters.
    await queryRunner.query(`DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM "Products" WHERE length("image") > 255) THEN
        RAISE EXCEPTION 'Cannot shorten Products.image: galleries exceed 255 characters';
      END IF;
    END $$`);
    await queryRunner.query(
      'ALTER TABLE "Products" ALTER COLUMN "image" TYPE varchar(255)',
    );
  }
}
