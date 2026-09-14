import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCashClosingsAndMovementReasons1788882000000 implements MigrationInterface {
  name = 'CreateCashClosingsAndMovementReasons1788882000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."CashRegisterClosing_status_enum" AS ENUM('PENDING', 'COMPLETED', 'REJECTED')`,
    );

    await queryRunner.query(
      `CREATE TABLE "CashMovementReason" (
        "cashMovementReasonID" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenantID" uuid NOT NULL,
        "code" character varying(50) NOT NULL,
        "name" character varying(100) NOT NULL,
        "type" "public"."CashMovement_type_enum",
        "requiresApproval" boolean NOT NULL DEFAULT false,
        "active" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cash_movement_reason_id" PRIMARY KEY ("cashMovementReasonID")
      )`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_cash_movement_reason_tenant_id" ON "CashMovementReason" ("tenantID", "cashMovementReasonID")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_cash_movement_reason_tenant_code" ON "CashMovementReason" ("tenantID", "code")`,
    );

    await queryRunner.query(
      `CREATE TABLE "CashRegisterClosing" (
        "closingID" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenantID" uuid NOT NULL,
        "sessionID" uuid NOT NULL,
        "status" "public"."CashRegisterClosing_status_enum" NOT NULL DEFAULT 'PENDING',
        "expectedCashAmount" numeric(12,2) NOT NULL,
        "expectedNonCashAmount" numeric(12,2) NOT NULL DEFAULT '0',
        "expectedTotalAmount" numeric(12,2) NOT NULL,
        "countedCashAmount" numeric(12,2),
        "actualTotalAmount" numeric(12,2),
        "cashDifference" numeric(12,2),
        "cashMovementCount" integer NOT NULL DEFAULT 0,
        "paymentCount" integer NOT NULL DEFAULT 0,
        "paymentMethodTotals" jsonb NOT NULL DEFAULT '[]',
        "performedByUserID" uuid NOT NULL,
        "completedByUserID" uuid,
        "rejectedByUserID" uuid,
        "startedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "completedAt" TIMESTAMP WITH TIME ZONE,
        "rejectedAt" TIMESTAMP WITH TIME ZONE,
        "rejectionReason" text,
        "notes" text,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cash_register_closing_id" PRIMARY KEY ("closingID"),
        CONSTRAINT "CHK_cash_register_closing_counted_non_negative" CHECK ("countedCashAmount" IS NULL OR "countedCashAmount" >= 0)
      )`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_cash_register_closing_tenant_id" ON "CashRegisterClosing" ("tenantID", "closingID")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cash_register_closing_tenant_session" ON "CashRegisterClosing" ("tenantID", "sessionID")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cash_register_closing_tenant_status" ON "CashRegisterClosing" ("tenantID", "status")`,
    );

    // Garantiza a nivel de base de datos un único arqueo en curso por sesión.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_unique_pending_closing_per_session" ON "CashRegisterClosing" ("tenantID", "sessionID") WHERE status = 'PENDING'`,
    );

    await queryRunner.query(
      `ALTER TABLE "CashRegisterClosing" ADD CONSTRAINT "FK_cash_register_closing_session" FOREIGN KEY ("sessionID") REFERENCES "CashRegisterSession"("sessionID") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "CashRegisterClosing" DROP CONSTRAINT "FK_cash_register_closing_session"`,
    );

    await queryRunner.query(
      `DROP INDEX "public"."IDX_unique_pending_closing_per_session"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_cash_register_closing_tenant_status"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_cash_register_closing_tenant_session"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_cash_register_closing_tenant_id"`,
    );
    await queryRunner.query(`DROP TABLE "CashRegisterClosing"`);

    await queryRunner.query(
      `DROP INDEX "public"."IDX_cash_movement_reason_tenant_code"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_cash_movement_reason_tenant_id"`,
    );
    await queryRunner.query(`DROP TABLE "CashMovementReason"`);

    await queryRunner.query(
      `DROP TYPE "public"."CashRegisterClosing_status_enum"`,
    );
  }
}
