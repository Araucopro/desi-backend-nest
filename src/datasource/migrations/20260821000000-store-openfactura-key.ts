import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agrega almacenamiento seguro para la API key de Openfactura por tienda.
 *
 * - `openfacturaKeyEncrypted`: Almacena el valor cifrado mediante AES-256-GCM (iv:ciphertext:authTag).
 * - `hasOpenfacturaKey`: Flag booleano público que indica si la tienda tiene configurada su credencial.
 */
export class StoreOpenfacturaKey20260821000000 implements MigrationInterface {
  name = 'StoreOpenfacturaKey20260821000000';

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
    if (await this.tableExists(queryRunner, 'Store')) {
      await queryRunner.query(
        `ALTER TABLE "Store"
         ADD COLUMN IF NOT EXISTS "openfacturaKeyEncrypted" text NULL`,
      );
      await queryRunner.query(
        `ALTER TABLE "Store"
         ADD COLUMN IF NOT EXISTS "hasOpenfacturaKey" boolean NOT NULL DEFAULT false`,
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await this.tableExists(queryRunner, 'Store')) {
      await queryRunner.query(
        `ALTER TABLE "Store"
         DROP COLUMN IF EXISTS "hasOpenfacturaKey"`,
      );
      await queryRunner.query(
        `ALTER TABLE "Store"
         DROP COLUMN IF EXISTS "openfacturaKeyEncrypted"`,
      );
    }
  }
}
