import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameSaleFmaPago1790802000000 implements MigrationInterface {
  name = 'RenameSaleFmaPago1790802000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "Sale" RENAME COLUMN "paymentType" TO "fmaPago"`,
    );
    await queryRunner.query(`
      ALTER TABLE "Sale"
      ALTER COLUMN "fmaPago" TYPE character varying(1)
      USING CASE "fmaPago"::text
        WHEN 'Credito' THEN '2'
        WHEN 'Sin costo' THEN '3'
        ELSE '1'
      END
    `);
    await queryRunner.query(`DROP TYPE "public"."Sale_paymenttype_enum"`);
    await queryRunner.query(`
      ALTER TABLE "Sale"
      ADD CONSTRAINT "CHK_sale_fma_pago" CHECK ("fmaPago" IN ('1', '2', '3'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "Sale" DROP CONSTRAINT "CHK_sale_fma_pago"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."Sale_paymenttype_enum" AS ENUM('Efectivo', 'Debito', 'Credito', 'Sin costo')`,
    );
    await queryRunner.query(
      `ALTER TABLE "Sale" RENAME COLUMN "fmaPago" TO "paymentType"`,
    );
    await queryRunner.query(`
      ALTER TABLE "Sale"
      ALTER COLUMN "paymentType" TYPE "public"."Sale_paymenttype_enum"
      USING CASE "paymentType"
        WHEN '2' THEN 'Credito'::"public"."Sale_paymenttype_enum"
        WHEN '3' THEN 'Sin costo'::"public"."Sale_paymenttype_enum"
        ELSE 'Efectivo'::"public"."Sale_paymenttype_enum"
      END
    `);
  }
}
