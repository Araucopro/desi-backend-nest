import { MigrationInterface, QueryRunner } from 'typeorm';

export class FoundationRls20260723000100 implements MigrationInterface {
  name = 'FoundationRls20260723000100';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
    // The first deployment is against an empty database. Creation is still
    // versioned here; application startup never synchronizes the schema.
    await queryRunner.connection.synchronize(false);
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS tenants ("tenantID" uuid PRIMARY KEY DEFAULT gen_random_uuid(), name varchar(160) NOT NULL, slug varchar(80) NOT NULL UNIQUE, status varchar(20) NOT NULL DEFAULT 'PROVISIONING', "maxStores" integer NOT NULL DEFAULT 5, "maxUsers" integer NOT NULL DEFAULT 5, "timeZone" varchar(64) NOT NULL DEFAULT 'America/Santiago', locale varchar(8) NOT NULL DEFAULT 'es-CL', "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now())`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS master_users ("masterUserID" uuid PRIMARY KEY DEFAULT gen_random_uuid(), email varchar(128) NOT NULL UNIQUE, password varchar(255) NOT NULL, role varchar(32) NOT NULL, "sessionVersion" integer NOT NULL DEFAULT 1, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now())`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS audit_events ("auditEventID" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "tenantID" uuid NULL REFERENCES tenants("tenantID"), "masterUserID" uuid NULL REFERENCES master_users("masterUserID"), action varchar(16) NOT NULL, endpoint varchar(255) NOT NULL, reason text NULL, result varchar(32) NOT NULL, "createdAt" timestamptz NOT NULL DEFAULT now())`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS audit_events_tenant_created_idx ON audit_events ("tenantID", "createdAt")`,
    );
    await queryRunner.query(
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN CREATE ROLE app_runtime NOLOGIN; END IF; END $$`,
    );
    const tables = await queryRunner.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name NOT IN ('migrations','tenants','master_users','audit_events')`,
    );
    for (const row of tables as Array<{ table_name: string }>) {
      const table = row.table_name.replace(/"/g, '""');
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "tenantID" uuid`,
      );
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "${table}_tenantID_idx" ON "${table}" ("tenantID")`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`,
      );
      await queryRunner.query(
        `DROP POLICY IF EXISTS tenant_isolation_select ON "${table}"`,
      );
      await queryRunner.query(
        `CREATE POLICY tenant_isolation_select ON "${table}" FOR SELECT USING ("tenantID" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)`,
      );
      await queryRunner.query(
        `DROP POLICY IF EXISTS tenant_isolation_write ON "${table}"`,
      );
      await queryRunner.query(
        `CREATE POLICY tenant_isolation_write ON "${table}" USING ("tenantID" = NULLIF(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenantID" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)`,
      );
      await queryRunner.query(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "${table}" TO app_runtime`,
      );
    }
    await queryRunner.query(`ALTER TABLE tenants ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(
      `ALTER TABLE master_users ENABLE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(`GRANT USAGE ON SCHEMA public TO app_runtime`);
    await queryRunner.query(
      `GRANT SELECT, INSERT, UPDATE ON tenants, master_users, audit_events TO app_runtime`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const tables = await queryRunner.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
    );
    for (const row of tables as Array<{ table_name: string }>) {
      if (
        ['migrations', 'tenants', 'master_users', 'audit_events'].includes(
          row.table_name,
        )
      )
        continue;
      const table = row.table_name.replace(/"/g, '""');
      await queryRunner.query(
        `DROP POLICY IF EXISTS tenant_isolation_select ON "${table}"`,
      );
      await queryRunner.query(
        `DROP POLICY IF EXISTS tenant_isolation_write ON "${table}"`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" DISABLE ROW LEVEL SECURITY`,
      );
    }
    await queryRunner.query(`DROP TABLE IF EXISTS audit_events`);
    await queryRunner.query(`DROP TABLE IF EXISTS master_users`);
    await queryRunner.query(`DROP TABLE IF EXISTS tenants`);
  }
}
