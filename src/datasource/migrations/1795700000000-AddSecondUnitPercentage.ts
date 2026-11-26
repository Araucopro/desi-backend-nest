import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSecondUnitPercentage1795700000000 implements MigrationInterface {
  name = 'AddSecondUnitPercentage1795700000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."SpecialOffer_discounttype_enum" ADD VALUE IF NOT EXISTS 'SECOND_UNIT_PERCENTAGE'`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // No implicit conversion or deletion of campaigns on rollback. The cast
    // below fails atomically if any tenant still has offers of the new type.
    await queryRunner.query(
      `ALTER TYPE "public"."SpecialOffer_discounttype_enum" RENAME TO "SpecialOffer_discounttype_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."SpecialOffer_discounttype_enum" AS ENUM('PERCENTAGE', 'FIXED_AMOUNT', 'FIXED_PRICE', 'BUY_X_GET_Y', 'BUNDLE')`,
    );
    await queryRunner.query(
      `ALTER TABLE "SpecialOffer" ALTER COLUMN "discountType" TYPE "public"."SpecialOffer_discounttype_enum" USING "discountType"::text::"public"."SpecialOffer_discounttype_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."SpecialOffer_discounttype_enum_old"`,
    );
  }
}
