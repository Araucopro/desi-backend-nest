/**
 * Carga de `src/test/.env.test`.
 *
 * Es un módulo aparte porque hay **dos** contextos que necesitan las mismas
 * variables y no comparten ciclo de vida:
 *
 * - `setup-env.ts`, registrado como `setupFiles`, corre dentro del contexto de
 *   cada test;
 * - `global-setup.ts` corre en el proceso principal y **antes** que
 *   `setupFiles`. Si no carga el entorno por su cuenta, lee el `.env` de la raíz
 *   y apunta al servidor equivocado.
 *
 * No usa `override` para que las variables ya presentes en el shell manden
 * (útil para apuntar el arnés a otra base sin editar el archivo). `quiet` evita
 * que dotenv ensucie la salida del reporter de Jest.
 */
import { config } from 'dotenv';
import { join } from 'node:path';

export function loadTestEnv(): void {
  config({ path: join(__dirname, '.env.test'), quiet: true });
}
