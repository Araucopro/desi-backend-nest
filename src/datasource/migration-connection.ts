import type { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';

type Connection = Pick<
  PostgresConnectionOptions,
  'url' | 'host' | 'port' | 'username' | 'password' | 'database'
>;

/** CLI-only connection. Never changes the API runtime's database credentials. */
export function migrationConnection(
  env: NodeJS.ProcessEnv = process.env,
): Connection {
  const url = env.MIGRATION_DATABASE_URL?.trim() || env.DATABASE_URL?.trim();
  if (url) return { url };

  return {
    host: env.PGHOST || 'localhost',
    port: Number(env.PGPORT || 5432),
    username: env.PG_OWNER_USER || env.PGUSER || 'postgres',
    password: env.PG_OWNER_PASSWORD || env.PGPASSWORD || 'postgres',
    database: env.PGDATABASE || 'postgres',
  };
}
