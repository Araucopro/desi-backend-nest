import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCashRegistersAndSessions1788880000000 implements MigrationInterface {
  name = 'CreateCashRegistersAndSessions1788880000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."CashRegister_status_enum" AS ENUM('ACTIVE', 'INACTIVE', 'MAINTENANCE')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."CashRegisterSession_status_enum" AS ENUM('OPEN', 'SUSPENDED', 'CLOSED')`,
    );

    await queryRunner.query(
      `CREATE TABLE "CashRegister" (
        "cashRegisterID" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenantID" uuid NOT NULL,
        "storeID" uuid NOT NULL,
        "code" character varying(50) NOT NULL,
        "name" character varying(100) NOT NULL,
        "status" "public"."CashRegister_status_enum" NOT NULL DEFAULT 'ACTIVE',
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cash_register_id" PRIMARY KEY ("cashRegisterID")
      )`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_cash_register_tenant_id" ON "CashRegister" ("tenantID", "cashRegisterID")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cash_register_tenant_store" ON "CashRegister" ("tenantID", "storeID")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_cash_register_tenant_store_code" ON "CashRegister" ("tenantID", "storeID", "code")`,
    );

    await queryRunner.query(
      `CREATE TABLE "CashRegisterSession" (
        "sessionID" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenantID" uuid NOT NULL,
        "cashRegisterID" uuid NOT NULL,
        "businessDate" date NOT NULL,
        "openedByUserID" uuid NOT NULL,
        "closedByUserID" uuid,
        "openedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "closedAt" TIMESTAMP WITH TIME ZONE,
        "openingBalance" numeric(12,2) NOT NULL DEFAULT '0',
        "expectedCashBalance" numeric(12,2),
        "countedCashBalance" numeric(12,2),
        "cashDifference" numeric(12,2),
        "status" "public"."CashRegisterSession_status_enum" NOT NULL DEFAULT 'OPEN',
        "openingNotes" text,
        "closingNotes" text,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cash_register_session_id" PRIMARY KEY ("sessionID")
      )`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_cash_register_session_tenant_session" ON "CashRegisterSession" ("tenantID", "sessionID")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cash_register_session_tenant_register" ON "CashRegisterSession" ("tenantID", "cashRegisterID")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cash_register_session_tenant_business_date" ON "CashRegisterSession" ("tenantID", "businessDate")`,
    );

    // Unique partial index garantizando que solo exista una sesión abierta por caja y tenant
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_unique_open_session_per_register" ON "CashRegisterSession" ("tenantID", "cashRegisterID") WHERE status = 'OPEN'`,
    );

    await queryRunner.query(
      `ALTER TABLE "CashRegister" ADD CONSTRAINT "FK_cash_register_store" FOREIGN KEY ("storeID") REFERENCES "Store"("storeID") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "CashRegisterSession" ADD CONSTRAINT "FK_cash_register_session_register" FOREIGN KEY ("cashRegisterID") REFERENCES "CashRegister"("cashRegisterID") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "CashRegisterSession" DROP CONSTRAINT "FK_cash_register_session_register"`,
    );
    await queryRunner.query(
      `ALTER TABLE "CashRegister" DROP CONSTRAINT "FK_cash_register_store"`,
    );

    await queryRunner.query(
      `DROP INDEX "public"."IDX_unique_open_session_per_register"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_cash_register_session_tenant_business_date"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_cash_register_session_tenant_register"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_cash_register_session_tenant_session"`,
    );
    await queryRunner.query(`DROP TABLE "CashRegisterSession"`);

    await queryRunner.query(
      `DROP INDEX "public"."IDX_cash_register_tenant_store_code"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_cash_register_tenant_store"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_cash_register_tenant_id"`,
    );
    await queryRunner.query(`DROP TABLE "CashRegister"`);

    await queryRunner.query(
      `DROP TYPE "public"."CashRegisterSession_status_enum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."CashRegister_status_enum"`);
  }
}
