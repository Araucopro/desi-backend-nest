import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fase 3.1 — Elimina `SUSPENDED` del enum de estado de sesión de caja.
 *
 * `SUSPENDED` nunca se asignó desde el código: existía solo en la definición del
 * tipo. Al ser un estado muerto, cualquier sesión que lo tomara quedaría fuera
 * del índice único parcial `IDX_unique_open_session_per_register` (que solo
 * cubre `status = 'OPEN'`) y por lo tanto invisible para `openSession`, que
 * rechazaría la apertura para siempre sin explicación.
 *
 * Orden obligatorio dentro de la misma transacción:
 *   1. `DROP INDEX` del índice parcial — referencia el tipo del enum.
 *   2. Recrear el tipo con 2 valores y reasignar la columna.
 *   3. Recrear el índice contra el tipo nuevo.
 *
 * El `USING "status"::text::"..."` no es opcional: PostgreSQL no tiene un cast
 * directo entre dos tipos enum distintos, así que hay que pasar por texto.
 *
 * `migrationsTransactionMode: 'each'` (ver `data-source.ts`) envuelve esta
 * migración en una sola transacción, así que un fallo a mitad de camino no deja
 * la tabla con el tipo viejo y el índice ausente.
 */
export class DropCashRegisterSessionSuspendedStatus1788891000000 implements MigrationInterface {
  name = 'DropCashRegisterSessionSuspendedStatus1788891000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. El índice parcial depende del tipo del enum: fuera antes del ALTER.
    await queryRunner.query(
      `DROP INDEX "public"."IDX_unique_open_session_per_register"`,
    );

    // 2. Recrear el tipo sin SUSPENDED y migrar la columna existente.
    await queryRunner.query(
      `ALTER TYPE "public"."CashRegisterSession_status_enum" RENAME TO "CashRegisterSession_status_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."CashRegisterSession_status_enum" AS ENUM('OPEN', 'CLOSED')`,
    );
    await queryRunner.query(
      `ALTER TABLE "CashRegisterSession"
         ALTER COLUMN "status" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "CashRegisterSession"
         ALTER COLUMN "status" TYPE "public"."CashRegisterSession_status_enum"
         USING "status"::text::"public"."CashRegisterSession_status_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "CashRegisterSession"
         ALTER COLUMN "status" SET DEFAULT 'OPEN'`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."CashRegisterSession_status_enum_old"`,
    );

    // 3. Recrear el invariante de "una sola sesión OPEN por caja y tenant".
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_unique_open_session_per_register"
         ON "CashRegisterSession" ("tenantID", "cashRegisterID")
         WHERE status = 'OPEN'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_unique_open_session_per_register"`,
    );

    await queryRunner.query(
      `ALTER TYPE "public"."CashRegisterSession_status_enum" RENAME TO "CashRegisterSession_status_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."CashRegisterSession_status_enum" AS ENUM('OPEN', 'SUSPENDED', 'CLOSED')`,
    );
    await queryRunner.query(
      `ALTER TABLE "CashRegisterSession"
         ALTER COLUMN "status" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "CashRegisterSession"
         ALTER COLUMN "status" TYPE "public"."CashRegisterSession_status_enum"
         USING "status"::text::"public"."CashRegisterSession_status_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "CashRegisterSession"
         ALTER COLUMN "status" SET DEFAULT 'OPEN'`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."CashRegisterSession_status_enum_old"`,
    );

    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_unique_open_session_per_register"
         ON "CashRegisterSession" ("tenantID", "cashRegisterID")
         WHERE status = 'OPEN'`,
    );
  }
}
