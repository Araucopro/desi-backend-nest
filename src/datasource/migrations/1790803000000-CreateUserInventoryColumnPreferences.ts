import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUserInventoryColumnPreferences1790803000000 implements MigrationInterface {
  name = 'CreateUserInventoryColumnPreferences1790803000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "UserInventoryColumnPreference" (
        "preferenceID" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenantID" uuid NOT NULL,
        "userID" uuid NOT NULL,
        "storeID" uuid,
        "storeFilter" character varying(16),
        "hiddenColumns" jsonb NOT NULL,
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_UserInventoryColumnPreference" PRIMARY KEY ("preferenceID"),
        CONSTRAINT "CHK_UserInventoryColumnPreference_context" CHECK (
          ("storeID" IS NOT NULL AND "storeFilter" IS NULL)
          OR ("storeID" IS NULL AND "storeFilter" IS NOT NULL AND "storeFilter" IN ('all', 'propias', 'consignadas'))
        ),
        CONSTRAINT "CHK_UserInventoryColumnPreference_hiddenColumns" CHECK (
          jsonb_typeof("hiddenColumns") = 'array'
        )
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_UserInventoryColumnPreference_store"
      ON "UserInventoryColumnPreference" ("tenantID", "userID", "storeID")
      WHERE "storeID" IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_UserInventoryColumnPreference_filter"
      ON "UserInventoryColumnPreference" ("tenantID", "userID", "storeFilter")
      WHERE "storeFilter" IS NOT NULL
    `);
    await queryRunner.query(
      `ALTER TABLE "UserInventoryColumnPreference" ENABLE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `ALTER TABLE "UserInventoryColumnPreference" FORCE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(`
      CREATE POLICY "UserInventoryColumnPreference_tenant_isolation"
      ON "UserInventoryColumnPreference"
      USING ("tenantID" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
      WITH CHECK ("tenantID" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP POLICY "UserInventoryColumnPreference_tenant_isolation" ON "UserInventoryColumnPreference"`,
    );
    await queryRunner.query(
      `ALTER TABLE "UserInventoryColumnPreference" NO FORCE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `ALTER TABLE "UserInventoryColumnPreference" DISABLE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_UserInventoryColumnPreference_filter"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_UserInventoryColumnPreference_store"`,
    );
    await queryRunner.query(`DROP TABLE "UserInventoryColumnPreference"`);
  }
}
