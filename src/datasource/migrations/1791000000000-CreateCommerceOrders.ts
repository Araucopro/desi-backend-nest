import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCommerceOrders1791000000000 implements MigrationInterface {
  name = 'CreateCommerceOrders1791000000000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "commerce_channels" ADD COLUMN "salesEnabled" boolean NOT NULL DEFAULT false, ADD COLUMN "acceptTestPayments" boolean NOT NULL DEFAULT false',
    );
    await queryRunner.query(
      'CREATE TABLE "commerce_orders" (' +
        '"commerceOrderID" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),' +
        '"tenantID" uuid NOT NULL REFERENCES "tenants"("tenantID") ON DELETE RESTRICT,' +
        '"storeID" uuid NOT NULL REFERENCES "Store"("storeID") ON DELETE RESTRICT,' +
        '"channelID" uuid NOT NULL REFERENCES "commerce_channels"("channelID") ON DELETE RESTRICT,' +
        '"externalOrderID" varchar(128) NOT NULL,' +
        '"saleID" uuid NOT NULL REFERENCES "Sale"("saleID") ON DELETE RESTRICT,' +
        '"requestHash" char(64) NOT NULL,' +
        '"paymentProvider" varchar(32) NOT NULL, "paymentReference" varchar(128) NOT NULL,' +
        '"amount" numeric(12,2) NOT NULL CHECK ("amount" > 0 AND "amount" = trunc("amount")),' +
        '\"currency\" char(3) NOT NULL CHECK (\"currency\" = \'CLP\'),' +
        '"paidAt" timestamptz NOT NULL, "isTest" boolean NOT NULL,' +
        '"customerDetails" jsonb NOT NULL, "createdAt" timestamptz NOT NULL DEFAULT now(),' +
        'CONSTRAINT "UQ_commerce_orders_order" UNIQUE ("tenantID", "channelID", "externalOrderID"),' +
        'CONSTRAINT "UQ_commerce_orders_payment" UNIQUE ("tenantID", "paymentProvider", "paymentReference"),' +
        'CONSTRAINT "UQ_commerce_orders_sale" UNIQUE ("tenantID", "saleID"))',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_commerce_orders_tenant_id" ON "commerce_orders" ("tenantID", "commerceOrderID")',
    );
    await queryRunner.query(
      'ALTER TABLE "commerce_orders" ENABLE ROW LEVEL SECURITY',
    );
    await queryRunner.query(
      'ALTER TABLE "commerce_orders" FORCE ROW LEVEL SECURITY',
    );
    await queryRunner.query(
      'CREATE POLICY "commerce_orders_tenant_isolation" ON "commerce_orders" ' +
        "USING (\"tenantID\" = NULLIF(current_setting('app.tenant_id', true), '')::uuid) " +
        "WITH CHECK (\"tenantID\" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)",
    );
    await queryRunner.query(
      "DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN " +
        'GRANT SELECT, INSERT ON "commerce_orders" TO app_runtime; END IF; END $$',
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "commerce_orders"');
    await queryRunner.query(
      'ALTER TABLE "commerce_channels" DROP COLUMN "acceptTestPayments", DROP COLUMN "salesEnabled"',
    );
  }
}
