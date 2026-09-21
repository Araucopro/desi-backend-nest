import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateHrAttendance1788887000000 implements MigrationInterface {
  name = 'CreateHrAttendance1788887000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."HrAttendanceOverride_type_enum" AS ENUM('VACATION', 'MEDICAL_LEAVE', 'PERMIT', 'JUSTIFIED_ABSENCE', 'UNJUSTIFIED_ABSENCE', 'PRESENT_ON_CLOSED_DAY')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."HrAttendanceAuditLog_action_enum" AS ENUM('CREATED', 'UPDATED', 'DELETED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "HrStoreClosure" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenantID" uuid NOT NULL, "storeID" uuid NOT NULL, "startDate" date NOT NULL, "endDate" date NOT NULL, "reason" text NOT NULL, "createdBy" uuid, "cancelledAt" TIMESTAMP WITH TIME ZONE, "cancelledBy" uuid, "cancellationReason" text, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_HrStoreClosure_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_HrStoreClosure_tenant_store_dates" ON "HrStoreClosure" ("tenantID", "storeID", "startDate", "endDate")`,
    );
    await queryRunner.query(
      `CREATE TABLE "HrAttendanceOverride" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenantID" uuid NOT NULL, "employeeID" uuid NOT NULL, "storeID" uuid NOT NULL, "startDate" date NOT NULL, "endDate" date NOT NULL, "type" "public"."HrAttendanceOverride_type_enum" NOT NULL, "reason" text NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_HrAttendanceOverride_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_HrAttendanceOverride_tenant_store_employee_dates" ON "HrAttendanceOverride" ("tenantID", "storeID", "employeeID", "startDate", "endDate")`,
    );
    await queryRunner.query(
      `CREATE TABLE "HrAttendanceAuditLog" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenantID" uuid NOT NULL, "overrideID" uuid, "employeeID" uuid NOT NULL, "storeID" uuid NOT NULL, "action" "public"."HrAttendanceAuditLog_action_enum" NOT NULL, "affectedStartDate" date NOT NULL, "affectedEndDate" date NOT NULL, "previousType" "public"."HrAttendanceOverride_type_enum", "newType" "public"."HrAttendanceOverride_type_enum", "previousReason" text, "newReason" text, "performedByUserID" uuid, "performedByMasterUserID" uuid, "performedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_HrAttendanceAuditLog_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_HrAttendanceAuditLog_tenant_store_performed" ON "HrAttendanceAuditLog" ("tenantID", "storeID", "performedAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_HrAttendanceAuditLog_tenant_employee_dates" ON "HrAttendanceAuditLog" ("tenantID", "employeeID", "affectedStartDate", "affectedEndDate")`,
    );
    await queryRunner.query(
      `ALTER TABLE "HrStoreClosure" ADD CONSTRAINT "FK_HrStoreClosure_store" FOREIGN KEY ("storeID") REFERENCES "Store"("storeID") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "HrAttendanceOverride" ADD CONSTRAINT "FK_HrAttendanceOverride_employee" FOREIGN KEY ("employeeID") REFERENCES "Users"("userID") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "HrAttendanceOverride" ADD CONSTRAINT "FK_HrAttendanceOverride_store" FOREIGN KEY ("storeID") REFERENCES "Store"("storeID") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    for (const table of [
      'HrStoreClosure',
      'HrAttendanceOverride',
      'HrAttendanceAuditLog',
    ]) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`,
      );
      await queryRunner.query(
        `CREATE POLICY "${table}_tenant_isolation" ON "${table}"
         USING ("tenantID" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
         WITH CHECK ("tenantID" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of [
      'HrStoreClosure',
      'HrAttendanceOverride',
      'HrAttendanceAuditLog',
    ]) {
      await queryRunner.query(
        `DROP POLICY "${table}_tenant_isolation" ON "${table}"`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" NO FORCE ROW LEVEL SECURITY`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" DISABLE ROW LEVEL SECURITY`,
      );
    }
    await queryRunner.query(
      `ALTER TABLE "HrAttendanceOverride" DROP CONSTRAINT "FK_HrAttendanceOverride_store"`,
    );
    await queryRunner.query(
      `ALTER TABLE "HrAttendanceOverride" DROP CONSTRAINT "FK_HrAttendanceOverride_employee"`,
    );
    await queryRunner.query(
      `ALTER TABLE "HrStoreClosure" DROP CONSTRAINT "FK_HrStoreClosure_store"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_HrAttendanceAuditLog_tenant_employee_dates"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_HrAttendanceAuditLog_tenant_store_performed"`,
    );
    await queryRunner.query(`DROP TABLE "HrAttendanceAuditLog"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_HrAttendanceOverride_tenant_store_employee_dates"`,
    );
    await queryRunner.query(`DROP TABLE "HrAttendanceOverride"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_HrStoreClosure_tenant_store_dates"`,
    );
    await queryRunner.query(`DROP TABLE "HrStoreClosure"`);
    await queryRunner.query(
      `DROP TYPE "public"."HrAttendanceAuditLog_action_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."HrAttendanceOverride_type_enum"`,
    );
  }
}
