import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePaymentsAndCashMovements1788881000000 implements MigrationInterface {
  name = 'CreatePaymentsAndCashMovements1788881000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."PaymentMethod_type_enum" AS ENUM('CASH', 'DEBIT_CARD', 'CREDIT_CARD', 'BANK_TRANSFER', 'CHECK', 'CREDIT', 'OTHER')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."Payment_status_enum" AS ENUM('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED', 'REFUNDED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."CashMovement_type_enum" AS ENUM('CASH_IN', 'CASH_OUT')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."CashMovement_status_enum" AS ENUM('POSTED', 'VOIDED')`,
    );

    await queryRunner.query(
      `CREATE TABLE "PaymentMethod" (
        "paymentMethodID" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenantID" uuid NOT NULL,
        "code" character varying(50) NOT NULL,
        "name" character varying(100) NOT NULL,
        "type" "public"."PaymentMethod_type_enum" NOT NULL,
        "affectsCash" boolean NOT NULL DEFAULT false,
        "active" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_payment_method_id" PRIMARY KEY ("paymentMethodID")
      )`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_payment_method_tenant_id" ON "PaymentMethod" ("tenantID", "paymentMethodID")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_payment_method_tenant_code" ON "PaymentMethod" ("tenantID", "code")`,
    );

    await queryRunner.query(
      `CREATE TABLE "CashMovement" (
        "cashMovementID" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenantID" uuid NOT NULL,
        "sessionID" uuid NOT NULL,
        "type" "public"."CashMovement_type_enum" NOT NULL,
        "amount" numeric(12,2) NOT NULL,
        "status" "public"."CashMovement_status_enum" NOT NULL DEFAULT 'POSTED',
        "reason" character varying(50) NOT NULL,
        "referenceType" character varying(50),
        "referenceID" uuid,
        "description" text,
        "createdByUserID" uuid NOT NULL,
        "occurredAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "voidedAt" TIMESTAMP WITH TIME ZONE,
        "voidedByUserID" uuid,
        "voidReason" text,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cash_movement_id" PRIMARY KEY ("cashMovementID"),
        CONSTRAINT "CHK_cash_movement_amount_positive" CHECK ("amount" > 0)
      )`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_cash_movement_tenant_id" ON "CashMovement" ("tenantID", "cashMovementID")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cash_movement_tenant_session" ON "CashMovement" ("tenantID", "sessionID")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cash_movement_tenant_reference" ON "CashMovement" ("tenantID", "referenceType", "referenceID")`,
    );

    await queryRunner.query(
      `CREATE TABLE "Payment" (
        "paymentID" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenantID" uuid NOT NULL,
        "saleID" uuid NOT NULL,
        "sessionID" uuid NOT NULL,
        "paymentMethodID" uuid NOT NULL,
        "amount" numeric(12,2) NOT NULL,
        "status" "public"."Payment_status_enum" NOT NULL DEFAULT 'COMPLETED',
        "authorizationCode" character varying(100),
        "transactionID" character varying(100),
        "reference" character varying(255),
        "paidAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_payment_id" PRIMARY KEY ("paymentID"),
        CONSTRAINT "CHK_payment_amount_positive" CHECK ("amount" > 0)
      )`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_payment_tenant_id" ON "Payment" ("tenantID", "paymentID")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_payment_tenant_sale" ON "Payment" ("tenantID", "saleID")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_payment_tenant_session" ON "Payment" ("tenantID", "sessionID")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_payment_tenant_method" ON "Payment" ("tenantID", "paymentMethodID")`,
    );

    // Sesión de caja asociada a la venta (nullable para compatibilidad progresiva)
    await queryRunner.query(
      `ALTER TABLE "Sale" ADD "cashRegisterSessionID" uuid`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_sale_tenant_cash_register_session" ON "Sale" ("tenantID", "cashRegisterSessionID")`,
    );

    await queryRunner.query(
      `ALTER TABLE "CashMovement" ADD CONSTRAINT "FK_cash_movement_session" FOREIGN KEY ("sessionID") REFERENCES "CashRegisterSession"("sessionID") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "Payment" ADD CONSTRAINT "FK_payment_sale" FOREIGN KEY ("saleID") REFERENCES "Sale"("saleID") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "Payment" ADD CONSTRAINT "FK_payment_session" FOREIGN KEY ("sessionID") REFERENCES "CashRegisterSession"("sessionID") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "Payment" ADD CONSTRAINT "FK_payment_method" FOREIGN KEY ("paymentMethodID") REFERENCES "PaymentMethod"("paymentMethodID") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "Sale" ADD CONSTRAINT "FK_sale_cash_register_session" FOREIGN KEY ("cashRegisterSessionID") REFERENCES "CashRegisterSession"("sessionID") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "Sale" DROP CONSTRAINT "FK_sale_cash_register_session"`,
    );
    await queryRunner.query(
      `ALTER TABLE "Payment" DROP CONSTRAINT "FK_payment_method"`,
    );
    await queryRunner.query(
      `ALTER TABLE "Payment" DROP CONSTRAINT "FK_payment_session"`,
    );
    await queryRunner.query(
      `ALTER TABLE "Payment" DROP CONSTRAINT "FK_payment_sale"`,
    );
    await queryRunner.query(
      `ALTER TABLE "CashMovement" DROP CONSTRAINT "FK_cash_movement_session"`,
    );

    await queryRunner.query(
      `DROP INDEX "public"."IDX_sale_tenant_cash_register_session"`,
    );
    await queryRunner.query(
      `ALTER TABLE "Sale" DROP COLUMN "cashRegisterSessionID"`,
    );

    await queryRunner.query(`DROP INDEX "public"."IDX_payment_tenant_method"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_payment_tenant_session"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_payment_tenant_sale"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_payment_tenant_id"`);
    await queryRunner.query(`DROP TABLE "Payment"`);

    await queryRunner.query(
      `DROP INDEX "public"."IDX_cash_movement_tenant_reference"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_cash_movement_tenant_session"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_cash_movement_tenant_id"`,
    );
    await queryRunner.query(`DROP TABLE "CashMovement"`);

    await queryRunner.query(
      `DROP INDEX "public"."IDX_payment_method_tenant_code"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_payment_method_tenant_id"`,
    );
    await queryRunner.query(`DROP TABLE "PaymentMethod"`);

    await queryRunner.query(`DROP TYPE "public"."CashMovement_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."CashMovement_type_enum"`);
    await queryRunner.query(`DROP TYPE "public"."Payment_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."PaymentMethod_type_enum"`);
  }
}
