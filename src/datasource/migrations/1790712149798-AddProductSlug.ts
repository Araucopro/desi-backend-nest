import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductSlug1790712149798 implements MigrationInterface {
  name = 'AddProductSlug1790712149798';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "Products" ADD COLUMN "slug" character varying(255)`,
    );

    const products: Array<{ productID: string; name: string }> =
      await queryRunner.query(
        `SELECT "productID", "name" FROM "Products" ORDER BY "productID"`,
      );

    for (const product of products) {
      const slug = this.slugify(product.name);
      await queryRunner.query(
        `UPDATE "Products" SET "slug" = $1 WHERE "productID" = $2`,
        [slug, product.productID],
      );
    }

    await queryRunner.query(
      `ALTER TABLE "Products" ALTER COLUMN "slug" SET NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "Products" DROP COLUMN "slug"`);
  }

  private slugify(name: string): string {
    return (
      name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'product'
    );
  }
}
