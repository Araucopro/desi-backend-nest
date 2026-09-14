import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCashTransfers1788884000000 implements MigrationInterface {
  name = 'CreateCashTransfers1788884000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."CashTransfer_status_enum" AS ENUM('PENDING', 'APPROVED', 'COMPLETED', 'REJECTED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."CashTransfer_destinationType_enum" AS ENUM('CASH_REGISTER', 'VAULT')`,
    );

    await queryRunner.query(
      `CREATE TABLE "CashTransfer" (
        "cashTransferID" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenantID" uuid NOT NULL,
        "storeID" uuid NOT NULL,
        "sourceCashRegisterID" uuid NOT NULL,
        "sourceSessionID" uuid NOT NULL,
        "destinationType" "public"."CashTransfer_destinationType_enum" NOT NULL,
        "destinationCashRegisterID" uuid,
        "destinationSessionID" uuid,
        "destinationLabel" character varying(100),
        "amount" numeric(12,2) NOT NULL,
        "status" "public"."CashTransfer_status_enum" NOT NULL DEFAULT 'PENDING',
        "requestedByUserID" uuid NOT NULL,
        "approvedByUserID" uuid,
        "rejectedByUserID" uuid,
        "cancelledByUserID" uuid,
        "completedByUserID" uuid,
        "requestedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "approvedAt" TIMESTAMP WITH TIME ZONE,
        "rejectedAt" TIMESTAMP WITH TIME ZONE,
        "cancelledAt" TIMESTAMP WITH TIME ZONE,
        "completedAt" TIMESTAMP WITH TIME ZONE,
        "occurredAt" TIMESTAMP WITH TIME ZONE,
        "sourceMovementID" uuid,
        "destinationMovementID" uuid,
        "notes" text,
        "approvalNotes" text,
        "rejectionReason" text,
        "cancellationReason" text,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cash_transfer_id" PRIMARY KEY ("cashTransferID"),
        CONSTRAINT "CHK_cash_transfer_amount_positive" CHECK ("amount" > 0),
        CONSTRAINT "CHK_cash_transfer_destination_matches_type" CHECK (
          ("destinationType" = 'CASH_REGISTER' AND "destinationCashRegisterID" IS NOT NULL)
          OR ("destinationType" = 'VAULT' AND "destinationCashRegisterID" IS NULL)
        ),
        CONSTRAINT "CHK_cash_transfer_destination_differs" CHECK (
          "destinationCashRegisterID" IS NULL
          OR "destinationCashRegisterID" <> "sourceCashRegisterID"
        )
      )`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_cash_transfer_tenant_id" ON "CashTransfer" ("tenantID", "cashTransferID")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cash_transfer_tenant_store" ON "CashTransfer" ("tenantID", "storeID")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cash_transfer_tenant_status" ON "CashTransfer" ("tenantID", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cash_transfer_tenant_source_session" ON "CashTransfer" ("tenantID", "sourceSessionID")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cash_transfer_tenant_destination_session" ON "CashTransfer" ("tenantID", "destinationSessionID")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cash_transfer_tenant_requested_at" ON "CashTransfer" ("tenantID", "requestedAt")`,
    );

    await queryRunner.query(
      `ALTER TABLE "CashTransfer" ADD CONSTRAINT "FK_cash_transfer_store" FOREIGN KEY ("storeID") REFERENCES "Store"("storeID") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "CashTransfer" ADD CONSTRAINT "FK_cash_transfer_source_register" FOREIGN KEY ("sourceCashRegisterID") REFERENCES "CashRegister"("cashRegisterID") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "CashTransfer" ADD CONSTRAINT "FK_cash_transfer_source_session" FOREIGN KEY ("sourceSessionID") REFERENCES "CashRegisterSession"("sessionID") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "CashTransfer" ADD CONSTRAINT "FK_cash_transfer_destination_register" FOREIGN KEY ("destinationCashRegisterID") REFERENCES "CashRegister"("cashRegisterID") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "CashTransfer" ADD CONSTRAINT "FK_cash_transfer_destination_session" FOREIGN KEY ("destinationSessionID") REFERENCES "CashRegisterSession"("sessionID") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "CashTransfer" ADD CONSTRAINT "FK_cash_transfer_source_movement" FOREIGN KEY ("sourceMovementID") REFERENCES "CashMovement"("cashMovementID") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "CashTransfer" ADD CONSTRAINT "FK_cash_transfer_destination_movement" FOREIGN KEY ("destinationMovementID") REFERENCES "CashMovement"("cashMovementID") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "CashTransfer" DROP CONSTRAINT "FK_cash_transfer_destination_movement"`,
    );
    await queryRunner.query(
      `ALTER TABLE "CashTransfer" DROP CONSTRAINT "FK_cash_transfer_source_movement"`,
    );
    await queryRunner.query(
      `ALTER TABLE "CashTransfer" DROP CONSTRAINT "FK_cash_transfer_destination_session"`,
    );
    await queryRunner.query(
      `ALTER TABLE "CashTransfer" DROP CONSTRAINT "FK_cash_transfer_destination_register"`,
    );
    await queryRunner.query(
      `ALTER TABLE "CashTransfer" DROP CONSTRAINT "FK_cash_transfer_source_session"`,
    );
    await queryRunner.query(
      `ALTER TABLE "CashTransfer" DROP CONSTRAINT "FK_cash_transfer_source_register"`,
    );
    await queryRunner.query(
      `ALTER TABLE "CashTransfer" DROP CONSTRAINT "FK_cash_transfer_store"`,
    );

    await queryRunner.query(
      `DROP INDEX "public"."IDX_cash_transfer_tenant_requested_at"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_cash_transfer_tenant_destination_session"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_cash_transfer_tenant_source_session"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_cash_transfer_tenant_status"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_cash_transfer_tenant_store"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_cash_transfer_tenant_id"`,
    );
    await queryRunner.query(`DROP TABLE "CashTransfer"`);

    await queryRunner.query(
      `DROP TYPE "public"."CashTransfer_destinationType_enum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."CashTransfer_status_enum"`);
  }
}
