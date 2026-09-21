import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserStoreHistory1788885000000 implements MigrationInterface {
  name = 'AddUserStoreHistory1788885000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "UserStore" ADD "effectiveFrom" date`);
    await queryRunner.query(`ALTER TABLE "UserStore" ADD "effectiveTo" date`);
    await queryRunner.query(
      `ALTER TABLE "UserStore" ADD "removedAt" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `UPDATE "UserStore" AS us
       SET "effectiveFrom" = (us."createdAt" AT TIME ZONE COALESCE(t."timeZone", 'America/Santiago'))::date
       FROM "tenants" AS t
       WHERE us."tenantID" = t."tenantID" AND us."effectiveFrom" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "UserStore" ALTER COLUMN "effectiveFrom" SET DEFAULT CURRENT_DATE`,
    );
    await queryRunner.query(
      `ALTER TABLE "UserStore" ALTER COLUMN "effectiveFrom" SET NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_UserStore_roster" ON "UserStore" ("tenantID", "storeID", "effectiveFrom", "effectiveTo")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_UserStore_active_assignment" ON "UserStore" ("tenantID", "userID", "storeID") WHERE "removedAt" IS NULL AND "effectiveTo" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_UserStore_active_assignment"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_UserStore_roster"`);
    await queryRunner.query(`ALTER TABLE "UserStore" DROP COLUMN "removedAt"`);
    await queryRunner.query(
      `ALTER TABLE "UserStore" DROP COLUMN "effectiveTo"`,
    );
    await queryRunner.query(
      `ALTER TABLE "UserStore" DROP COLUMN "effectiveFrom"`,
    );
  }
}
