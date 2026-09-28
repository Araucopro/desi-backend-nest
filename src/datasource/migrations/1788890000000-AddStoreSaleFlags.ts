import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStoreSaleFlags1788890000000 implements MigrationInterface {
  name = 'AddStoreSaleFlags1788890000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "Store" ADD "requireClientForSale" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "Store" ADD "allowNegativeStock" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "Store" DROP COLUMN "allowNegativeStock"`,
    );
    await queryRunner.query(
      `ALTER TABLE "Store" DROP COLUMN "requireClientForSale"`,
    );
  }
}
