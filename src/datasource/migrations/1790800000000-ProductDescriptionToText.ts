import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProductDescriptionToText1790800000000 implements MigrationInterface {
  name = 'ProductDescriptionToText1790800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "Products"
      ALTER COLUMN "description" TYPE text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "Products"
      ALTER COLUMN "description" TYPE character varying(255)
    `);
  }
}
