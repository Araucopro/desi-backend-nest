/**
 * Verifica que la base de datos de integración esté disponible antes de correr
 * los tests. Falla con un mensaje accionable en vez de con un timeout opaco.
 *
 * **Carga el entorno primero.** Jest ejecuta `globalSetup` antes que
 * `setupFiles`, así que sin esta llamada se leería el `.env` de la raíz y tanto
 * la comprobación de conexión como la creación de la base apuntarían a otro
 * servidor (por ejemplo el Railway de desarrollo) en vez de al contenedor.
 *
 * También se asegura de que la base exista: `docker compose` solo crea
 * `d3si_test` al inicializar el volumen, así que una vez que algo la borra todas
 * las corridas fallan con `database "..." does not exist`.
 */
import { ensureDatabaseExists, resolveTestDatabase } from './ensure-database';
import { loadTestEnv } from './load-env';

async function globalSetup(): Promise<void> {
  loadTestEnv();

  const database = resolveTestDatabase();
  const target = `${process.env.PGHOST ?? process.env.PGOWNERHOST ?? '127.0.0.1'}:${process.env.PGPORT ?? process.env.PGOWNERPORT ?? '5433'}`;

  try {
    await ensureDatabaseExists(database);
  } catch (error) {
    throw new Error(
      [
        `No se pudo preparar la base de datos de integración ("${database}" en ${target}).`,
        'Levanta el servicio `db` antes de correr los tests:',
        '  docker compose up -d db',
        `Detalle: ${(error as Error).message}`,
      ].join('\n'),
    );
  }
}

export default globalSetup;
