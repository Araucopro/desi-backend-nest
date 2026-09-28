/**
 * Creación idempotente de la base de datos de integración.
 *
 * Módulo deliberadamente autónomo: **solo** depende de `pg`. `global-setup.ts`
 * corre fuera del contexto de transformación de ts-jest y no puede importar
 * entidades ni migraciones, así que comparte esta pieza con
 * `integration/database.util.ts`.
 *
 * Se usa un `Client` de `pg` y no `DataSource.query`: el `QueryRunner` de
 * TypeORM abre una transacción implícita en Postgres y `CREATE DATABASE` no
 * puede correr dentro de una transacción (error `25001`), por lo que por esa vía
 * la creación fallaba siempre.
 */
import { Client } from 'pg';

export function resolveTestDatabase(): string {
  return process.env.PGDATABASE ?? 'araucotest';
}

/**
 * Traza a stderr: se ejecuta en `globalSetup`, antes de que Jest instale el
 * reporter, así que `console.log` se perdería y `process.stdout.write` puede no
 * estar disponible todavía.
 */
function trace(message: string): void {
  process.stderr.write(`[integration] ${message}\n`);
}

function buildAdminClient(): Client {
  return new Client({
    host: process.env.PGOWNERHOST ?? process.env.PGHOST ?? '127.0.0.1',
    port: Number(process.env.PGOWNERPORT ?? process.env.PGPORT ?? 5433),
    user: process.env.PGOWNERUSER ?? process.env.PGUSER ?? 'postgres',
    password:
      process.env.PGOWNERPASSWORD ?? process.env.PGPASSWORD ?? 'postgres',
    // `CREATE DATABASE` no puede ejecutarse sobre la base que se está creando,
    // así que la conexión administrativa apunta a `postgres`.
    database: 'postgres',
  });
}

export async function ensureDatabaseExists(database: string): Promise<void> {
  const client = buildAdminClient();
  // Se reporta el `database` efectivo del cliente, no el que se pidió: es la
  // forma de detectar que el arnés está apuntando a otro servidor del esperado.
  const target = `${client.host}:${client.port} → ${client.database}`;

  await client.connect();

  try {
    const existing = await client.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [database],
    );
    if (existing.rowCount) {
      trace(`base "${database}" ya existe en ${target}`);
      return;
    }

    trace(`creando base "${database}" en ${target}`);
    await client.query(`CREATE DATABASE "${database}"`);
    trace(`base "${database}" creada en ${target}`);
  } finally {
    await client.end();
  }
}
