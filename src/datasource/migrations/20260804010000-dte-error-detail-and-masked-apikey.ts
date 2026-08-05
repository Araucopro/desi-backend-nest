import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Trazabilidad y seguridad para el flujo DTE / Openfactura.
 *
 * - Agrega errorDetail para persistir el motivo de fallos de emisión.
 * - Enmascara las apikeys de Openfactura ya persistidas: solo se conserva
 *   un preview (4 primeros + 4 últimos caracteres). El valor original no es
 *   recuperable desde esta migración, a propósito.
 */
export class DteErrorDetailAndMaskedApikey20260804010000 implements MigrationInterface {
  name = 'DteErrorDetailAndMaskedApikey20260804010000';

  private async tableExists(
    queryRunner: QueryRunner,
    table: string,
  ): Promise<boolean> {
    const rows = await queryRunner.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1`,
      [table],
    );
    return Array.isArray(rows) && rows.length > 0;
  }

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await this.tableExists(queryRunner, 'DteDocument'))) return;

    await queryRunner.query(
      `ALTER TABLE "DteDocument" ADD COLUMN IF NOT EXISTS "errorDetail" text NULL`,
    );
    await queryRunner.query(
      `UPDATE "DteDocument"
       SET "apikey" = CASE
         WHEN length("apikey") <= 8 THEN '****'
         ELSE left("apikey", 4) || '...' || right("apikey", 4)
       END`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await this.tableExists(queryRunner, 'DteDocument'))) return;
    await queryRunner.query(
      `ALTER TABLE "DteDocument" DROP COLUMN IF EXISTS "errorDetail"`,
    );
  }
}
