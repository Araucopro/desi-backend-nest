import { migrationConnection } from './migration-connection';

describe('migrationConnection', () => {
  it('uses a separate migration account without changing the runtime URL', () => {
    const env = {
      DATABASE_URL: 'postgres://app_runtime:runtime@database:5432/erp',
      MIGRATION_DATABASE_URL: 'postgres://owner:owner@database:5432/erp',
    };
    expect(migrationConnection(env)).toEqual({
      url: env.MIGRATION_DATABASE_URL,
    });
    expect(env.DATABASE_URL).toBe(
      'postgres://app_runtime:runtime@database:5432/erp',
    );
  });

  it('preserves the database selected by DATABASE_URL even when PG defaults point elsewhere', () => {
    expect(
      migrationConnection({
        DATABASE_URL: 'postgres://owner:owner@database:5432/erp',
        PGHOST: 'wrong-host',
        PGDATABASE: 'wrong-db',
      }),
    ).toEqual({ url: 'postgres://owner:owner@database:5432/erp' });
  });

  it('ignores a blank migration override and trims the configured URL', () => {
    expect(
      migrationConnection({
        MIGRATION_DATABASE_URL: '  ',
        DATABASE_URL: ' postgres://owner:owner@database:5432/erp  ',
      }),
    ).toEqual({ url: 'postgres://owner:owner@database:5432/erp' });
  });

  it('uses owner credentials and the selected database for PG-style configuration', () => {
    expect(
      migrationConnection({
        PGHOST: 'database',
        PGPORT: '5433',
        PGDATABASE: 'erp',
        PGUSER: 'legacy',
        PGPASSWORD: 'legacy',
        PG_OWNER_USER: 'owner',
        PG_OWNER_PASSWORD: 'owner-secret',
        PG_RUNTIME_USER: 'app_runtime',
        PG_RUNTIME_PASSWORD: 'runtime-secret',
      }),
    ).toEqual({
      host: 'database',
      port: 5433,
      database: 'erp',
      username: 'owner',
      password: 'owner-secret',
    });
  });

  it('keeps legacy PGUSER and PGPASSWORD configuration working', () => {
    expect(
      migrationConnection({
        PGHOST: 'database',
        PGDATABASE: 'erp',
        PGUSER: 'legacy',
        PGPASSWORD: 'legacy-secret',
      }),
    ).toEqual({
      host: 'database',
      port: 5432,
      database: 'erp',
      username: 'legacy',
      password: 'legacy-secret',
    });
  });
});
