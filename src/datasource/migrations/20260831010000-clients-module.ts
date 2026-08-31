import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Módulo de clientes.
 *
 * - Crea la tabla Client con RLS, enum Client_segment_enum e índice compuesto (tenantID, clientID)
 * - UNIQUE (tenantID, rut)
 * - Agrega clientID a Sale y DispatchGuide como FK nullable ON DELETE SET NULL
 */
export class ClientsModule20260831010000 implements MigrationInterface {
  name = 'ClientsModule20260831010000';

  private async createEnumType(
    queryRunner: QueryRunner,
    typeName: string,
    values: string[],
  ): Promise<void> {
    await queryRunner.query(
      `DO $$ BEGIN
         CREATE TYPE "${typeName}" AS ENUM (${values
           .map((value) => `'${value}'`)
           .join(', ')});
       EXCEPTION WHEN duplicate_object THEN NULL;
       END $$;`,
    );
  }

  private async enableRls(
    queryRunner: QueryRunner,
    table: string,
  ): Promise<void> {
    await queryRunner.query(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`);
    await queryRunner.query(
      `DROP POLICY IF EXISTS tenant_isolation_select ON "${table}"`,
    );
    await queryRunner.query(
      `CREATE POLICY tenant_isolation_select ON "${table}"
       FOR SELECT USING ("tenantID" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)`,
    );
    await queryRunner.query(
      `DROP POLICY IF EXISTS tenant_isolation_write ON "${table}"`,
    );
    await queryRunner.query(
      `CREATE POLICY tenant_isolation_write ON "${table}"
       USING ("tenantID" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
       WITH CHECK ("tenantID" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)`,
    );
    await queryRunner.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "${table}" TO app_runtime`,
    );
  }

  async up(queryRunner: QueryRunner): Promise<void> {
    await this.createEnumType(queryRunner, 'Client_segment_enum', [
      'RETAIL',
      'WHOLESALE',
    ]);

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "Client" (
        "clientID" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantID" uuid NOT NULL,
        "rut" varchar(20) NOT NULL,
        "name" varchar(255) NOT NULL,
        "giro" varchar(255) NULL,
        "address" varchar(255) NULL,
        "city" varchar(255) NULL,
        "email" varchar(255) NULL,
        "phone" varchar(50) NULL,
        "segment" "Client_segment_enum" NOT NULL DEFAULT 'RETAIL',
        "notes" text NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_client_tenant_rut" UNIQUE ("tenantID", "rut")
      )`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "client_tenant_pk_idx"
       ON "Client" ("tenantID", "clientID")`,
    );

    await this.enableRls(queryRunner, 'Client');

    await queryRunner.query(
      `GRANT USAGE ON TYPE "Client_segment_enum" TO app_runtime`,
    );

    await queryRunner.query(
      `ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "clientID" uuid NULL REFERENCES "Client"("clientID") ON DELETE SET NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "DispatchGuide" ADD COLUMN IF NOT EXISTS "clientID" uuid NULL REFERENCES "Client"("clientID") ON DELETE SET NULL`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "sale_tenant_client_idx" ON "Sale" ("tenantID", "clientID")`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "dispatch_guide_tenant_client_idx" ON "DispatchGuide" ("tenantID", "clientID")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "dispatch_guide_tenant_client_idx"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "sale_tenant_client_idx"`);
    await queryRunner.query(
      `ALTER TABLE "DispatchGuide" DROP COLUMN IF EXISTS "clientID"`,
    );
    await queryRunner.query(
      `ALTER TABLE "Sale" DROP COLUMN IF EXISTS "clientID"`,
    );

    await queryRunner.query(
      `DROP POLICY IF EXISTS tenant_isolation_select ON "Client"`,
    );
    await queryRunner.query(
      `DROP POLICY IF EXISTS tenant_isolation_write ON "Client"`,
    );
    await queryRunner.query(`ALTER TABLE "Client" DISABLE ROW LEVEL SECURITY`);

    await queryRunner.query(`DROP TABLE IF EXISTS "Client"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "Client_segment_enum"`);
  }
}
