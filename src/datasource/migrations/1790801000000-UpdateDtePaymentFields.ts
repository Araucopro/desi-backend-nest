import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateDtePaymentFields1790801000000 implements MigrationInterface {
  name = 'UpdateDtePaymentFields1790801000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."Sale_paymenttype_enum" ADD VALUE IF NOT EXISTS 'Sin costo'`,
    );

    await queryRunner.query(
      `ALTER TABLE "DteDocument" ALTER COLUMN "paymentType" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "DteDocument" ALTER COLUMN "paymentType" TYPE character varying(100) USING "paymentType"::text`,
    );
    await queryRunner.query(
      `ALTER TABLE "DteDocument" ALTER COLUMN "paymentType" SET DEFAULT 'Efectivo'`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."DteDocument_paymenttype_enum"`,
    );

    await queryRunner.query(
      `ALTER TABLE "DteDocument" ADD "fmaPago" character varying(1) NOT NULL DEFAULT '1'`,
    );
    await queryRunner.query(
      `ALTER TABLE "DteDocument" ADD "medioPago" smallint NOT NULL DEFAULT 1`,
    );
    await queryRunner.query(`
      UPDATE "DteDocument"
      SET
        "fmaPago" = CASE "paymentType"
          WHEN 'Credito' THEN '2'
          WHEN 'Sin costo' THEN '3'
          ELSE '1'
        END,
        "medioPago" = CASE "paymentType"
          WHEN 'Efectivo' THEN 1
          WHEN 'Debito' THEN 2
          WHEN 'Credito' THEN 5
          ELSE 5
        END
    `);
    await queryRunner.query(`
      ALTER TABLE "DteDocument"
      ADD CONSTRAINT "CHK_dte_document_fma_pago"
        CHECK ("fmaPago" IN ('1', '2', '3')),
      ADD CONSTRAINT "CHK_dte_document_medio_pago"
        CHECK ("medioPago" IN (1, 2, 3, 4, 5))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "DteDocument"
      DROP CONSTRAINT "CHK_dte_document_medio_pago",
      DROP CONSTRAINT "CHK_dte_document_fma_pago"
    `);
    await queryRunner.query(
      `ALTER TABLE "DteDocument" DROP COLUMN "medioPago"`,
    );
    await queryRunner.query(`ALTER TABLE "DteDocument" DROP COLUMN "fmaPago"`);

    await queryRunner.query(
      `CREATE TYPE "public"."DteDocument_paymenttype_enum" AS ENUM('Efectivo', 'Debito', 'Credito')`,
    );
    await queryRunner.query(
      `ALTER TABLE "DteDocument" ALTER COLUMN "paymentType" DROP DEFAULT`,
    );
    await queryRunner.query(`
      ALTER TABLE "DteDocument"
      ALTER COLUMN "paymentType" TYPE "public"."DteDocument_paymenttype_enum"
      USING CASE
        WHEN "paymentType" = 'Debito' THEN 'Debito'::"public"."DteDocument_paymenttype_enum"
        WHEN "paymentType" = 'Credito' THEN 'Credito'::"public"."DteDocument_paymenttype_enum"
        ELSE 'Efectivo'::"public"."DteDocument_paymenttype_enum"
      END
    `);
    await queryRunner.query(
      `ALTER TABLE "DteDocument" ALTER COLUMN "paymentType" SET DEFAULT 'Efectivo'`,
    );

    await queryRunner.query(`
      ALTER TABLE "Sale" ALTER COLUMN "paymentType" TYPE text
      USING CASE
        WHEN "paymentType"::text = 'Sin costo' THEN 'Efectivo'
        ELSE "paymentType"::text
      END
    `);
    await queryRunner.query(
      `ALTER TYPE "public"."Sale_paymenttype_enum" RENAME TO "Sale_paymenttype_enum_with_no_cost"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."Sale_paymenttype_enum" AS ENUM('Efectivo', 'Debito', 'Credito')`,
    );
    await queryRunner.query(`
      ALTER TABLE "Sale" ALTER COLUMN "paymentType"
      TYPE "public"."Sale_paymenttype_enum"
      USING "paymentType"::"public"."Sale_paymenttype_enum"
    `);
    await queryRunner.query(
      `DROP TYPE "public"."Sale_paymenttype_enum_with_no_cost"`,
    );
  }
}
