import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSessionUsersCashCountsAndDenominations1788883000000 implements MigrationInterface {
  name = 'CreateSessionUsersCashCountsAndDenominations1788883000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."CashRegisterSessionUser_role_enum" AS ENUM('OPERATOR', 'SUPERVISOR')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."CashDenomination_type_enum" AS ENUM('COIN', 'BANKNOTE')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."CashCount_status_enum" AS ENUM('DRAFT', 'COMPLETED', 'CANCELLED')`,
    );

    await queryRunner.query(
      `CREATE TABLE "CashRegisterSessionUser" (
        "sessionUserID" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenantID" uuid NOT NULL,
        "sessionID" uuid NOT NULL,
        "userID" uuid NOT NULL,
        "role" "public"."CashRegisterSessionUser_role_enum" NOT NULL DEFAULT 'OPERATOR',
        "assignedByUserID" uuid NOT NULL,
        "enteredAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "leftAt" TIMESTAMP WITH TIME ZONE,
        "notes" text,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cash_register_session_user_id" PRIMARY KEY ("sessionUserID"),
        CONSTRAINT "CHK_cash_register_session_user_exit_after_entry" CHECK ("leftAt" IS NULL OR "leftAt" >= "enteredAt")
      )`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_cash_register_session_user_tenant_id" ON "CashRegisterSessionUser" ("tenantID", "sessionUserID")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cash_register_session_user_tenant_session" ON "CashRegisterSessionUser" ("tenantID", "sessionID")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cash_register_session_user_tenant_user" ON "CashRegisterSessionUser" ("tenantID", "userID")`,
    );

    // Un mismo usuario no puede tener dos turnos activos en la misma sesión.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_unique_active_session_user" ON "CashRegisterSessionUser" ("tenantID", "sessionID", "userID") WHERE "leftAt" IS NULL`,
    );

    await queryRunner.query(
      `CREATE TABLE "CashDenomination" (
        "cashDenominationID" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenantID" uuid NOT NULL,
        "value" numeric(12,2) NOT NULL,
        "type" "public"."CashDenomination_type_enum" NOT NULL,
        "label" character varying(50) NOT NULL,
        "sortOrder" integer NOT NULL DEFAULT 0,
        "active" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cash_denomination_id" PRIMARY KEY ("cashDenominationID"),
        CONSTRAINT "CHK_cash_denomination_value_positive" CHECK ("value" > 0)
      )`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_cash_denomination_tenant_id" ON "CashDenomination" ("tenantID", "cashDenominationID")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_cash_denomination_tenant_value_type" ON "CashDenomination" ("tenantID", "value", "type")`,
    );

    await queryRunner.query(
      `CREATE TABLE "CashCount" (
        "cashCountID" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenantID" uuid NOT NULL,
        "closingID" uuid NOT NULL,
        "sessionID" uuid NOT NULL,
        "status" "public"."CashCount_status_enum" NOT NULL DEFAULT 'DRAFT',
        "totalAmount" numeric(12,2) NOT NULL DEFAULT '0',
        "itemCount" integer NOT NULL DEFAULT 0,
        "countedByUserID" uuid NOT NULL,
        "completedByUserID" uuid,
        "cancelledByUserID" uuid,
        "startedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "countedAt" TIMESTAMP WITH TIME ZONE,
        "cancelledAt" TIMESTAMP WITH TIME ZONE,
        "cancellationReason" text,
        "notes" text,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cash_count_id" PRIMARY KEY ("cashCountID"),
        CONSTRAINT "CHK_cash_count_total_non_negative" CHECK ("totalAmount" >= 0)
      )`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_cash_count_tenant_id" ON "CashCount" ("tenantID", "cashCountID")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cash_count_tenant_closing" ON "CashCount" ("tenantID", "closingID")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cash_count_tenant_session" ON "CashCount" ("tenantID", "sessionID")`,
    );

    // Garantiza a nivel de base de datos un único conteo en curso por arqueo.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_unique_draft_cash_count_per_closing" ON "CashCount" ("tenantID", "closingID") WHERE status = 'DRAFT'`,
    );

    await queryRunner.query(
      `CREATE TABLE "CashCountItem" (
        "cashCountItemID" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenantID" uuid NOT NULL,
        "cashCountID" uuid NOT NULL,
        "denominationID" uuid NOT NULL,
        "denominationValue" numeric(12,2) NOT NULL,
        "denominationType" "public"."CashDenomination_type_enum" NOT NULL,
        "quantity" integer NOT NULL,
        "subtotal" numeric(12,2) NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cash_count_item_id" PRIMARY KEY ("cashCountItemID"),
        CONSTRAINT "CHK_cash_count_item_quantity_non_negative" CHECK ("quantity" >= 0),
        CONSTRAINT "CHK_cash_count_item_subtotal_non_negative" CHECK ("subtotal" >= 0)
      )`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_cash_count_item_tenant_id" ON "CashCountItem" ("tenantID", "cashCountItemID")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cash_count_item_tenant_count" ON "CashCountItem" ("tenantID", "cashCountID")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_cash_count_item_tenant_count_denomination" ON "CashCountItem" ("tenantID", "cashCountID", "denominationID")`,
    );

    await queryRunner.query(
      `ALTER TABLE "CashRegisterSessionUser" ADD CONSTRAINT "FK_cash_register_session_user_session" FOREIGN KEY ("sessionID") REFERENCES "CashRegisterSession"("sessionID") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "CashRegisterSessionUser" ADD CONSTRAINT "FK_cash_register_session_user_user" FOREIGN KEY ("userID") REFERENCES "Users"("userID") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "CashCount" ADD CONSTRAINT "FK_cash_count_closing" FOREIGN KEY ("closingID") REFERENCES "CashRegisterClosing"("closingID") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "CashCount" ADD CONSTRAINT "FK_cash_count_session" FOREIGN KEY ("sessionID") REFERENCES "CashRegisterSession"("sessionID") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "CashCountItem" ADD CONSTRAINT "FK_cash_count_item_cash_count" FOREIGN KEY ("cashCountID") REFERENCES "CashCount"("cashCountID") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "CashCountItem" ADD CONSTRAINT "FK_cash_count_item_denomination" FOREIGN KEY ("denominationID") REFERENCES "CashDenomination"("cashDenominationID") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "CashCountItem" DROP CONSTRAINT "FK_cash_count_item_denomination"`,
    );
    await queryRunner.query(
      `ALTER TABLE "CashCountItem" DROP CONSTRAINT "FK_cash_count_item_cash_count"`,
    );
    await queryRunner.query(
      `ALTER TABLE "CashCount" DROP CONSTRAINT "FK_cash_count_session"`,
    );
    await queryRunner.query(
      `ALTER TABLE "CashCount" DROP CONSTRAINT "FK_cash_count_closing"`,
    );
    await queryRunner.query(
      `ALTER TABLE "CashRegisterSessionUser" DROP CONSTRAINT "FK_cash_register_session_user_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "CashRegisterSessionUser" DROP CONSTRAINT "FK_cash_register_session_user_session"`,
    );

    await queryRunner.query(
      `DROP INDEX "public"."IDX_cash_count_item_tenant_count_denomination"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_cash_count_item_tenant_count"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_cash_count_item_tenant_id"`,
    );
    await queryRunner.query(`DROP TABLE "CashCountItem"`);

    await queryRunner.query(
      `DROP INDEX "public"."IDX_unique_draft_cash_count_per_closing"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_cash_count_tenant_session"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_cash_count_tenant_closing"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_cash_count_tenant_id"`);
    await queryRunner.query(`DROP TABLE "CashCount"`);

    await queryRunner.query(
      `DROP INDEX "public"."IDX_cash_denomination_tenant_value_type"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_cash_denomination_tenant_id"`,
    );
    await queryRunner.query(`DROP TABLE "CashDenomination"`);

    await queryRunner.query(
      `DROP INDEX "public"."IDX_unique_active_session_user"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_cash_register_session_user_tenant_user"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_cash_register_session_user_tenant_session"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_cash_register_session_user_tenant_id"`,
    );
    await queryRunner.query(`DROP TABLE "CashRegisterSessionUser"`);

    await queryRunner.query(`DROP TYPE "public"."CashCount_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."CashDenomination_type_enum"`);
    await queryRunner.query(
      `DROP TYPE "public"."CashRegisterSessionUser_role_enum"`,
    );
  }
}
