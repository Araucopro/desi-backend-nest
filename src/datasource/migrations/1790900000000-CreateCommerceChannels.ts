import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCommerceChannels1790900000000 implements MigrationInterface {
  name = 'CreateCommerceChannels1790900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "commerce_channels" (
        "channelID" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenantID" uuid NOT NULL,
        "storeID" uuid NOT NULL,
        "code" varchar(64) NOT NULL,
        "name" varchar(160) NOT NULL,
        "domain" varchar(255),
        "tokenHash" char(64) NOT NULL,
        "active" boolean NOT NULL DEFAULT true,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_commerce_channels" PRIMARY KEY ("channelID"),
        CONSTRAINT "FK_commerce_channels_tenant" FOREIGN KEY ("tenantID") REFERENCES "tenants"("tenantID") ON DELETE RESTRICT,
        CONSTRAINT "FK_commerce_channels_store" FOREIGN KEY ("storeID") REFERENCES "Store"("storeID") ON DELETE RESTRICT,
        CONSTRAINT "UQ_commerce_channels_tenant_code" UNIQUE ("tenantID", "code")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_commerce_channels_tenant" ON "commerce_channels" ("tenantID")`,
    );
    // Authentication resolves a channel before RLS establishes tenant context.
    // This platform table has no tenant-facing endpoints.
    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
          GRANT SELECT, INSERT, UPDATE ON "commerce_channels" TO app_runtime;
        END IF;
      END $$
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "commerce_channels"`);
  }
}
