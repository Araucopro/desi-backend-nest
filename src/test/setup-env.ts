/**
 * Carga `test/.env.test` antes de que se importe cualquier módulo de la app.
 *
 * Se registra como `setupFiles` (no `setupFilesAfterEnv`) porque `ConfigModule`
 * y los servicios leen `process.env` al construir los módulos: si las variables
 * se definen después, la conexión apunta a la base equivocada.
 */
import { loadTestEnv } from './load-env';

loadTestEnv();
