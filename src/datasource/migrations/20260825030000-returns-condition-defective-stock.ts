import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Condición del producto devuelto y stock defectuoso separado.
 *
 * - Agrega `condition` (SELLABLE | DEFECTIVE, default SELLABLE) a ReturnItem
 *   para registrar si el producto reingresa vendible o defectuoso.
 * - Agrega `stockDefective` (int, default 0) a StoreProduct como cache/read
 *   model del stock defectuoso, con la misma semántica que `stock`.
 * - Agrega `condition` (nullable) a InventoryMovements para trazar el bucket
 *   de inventario afectado por el movimiento.
 *
 * No se requieren cambios de políticas RLS: solo columnas nuevas en tablas
 * que ya tienen RLS activa y los permisos existentes cubren las columnas.
 */
export class ReturnsConditionDefectiveStock20260825030000 implements MigrationInterface {
  name = 'ReturnsConditionDefectiveStock20260825030000';

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

  private async createEnumType(
    queryRunner: QueryRunner,
    typeName: string,
    values: string[],
  ): Promise<void> {
    await queryRunner.query(
      `DO $$ BEGIN
         CREATE TYPE "${typeName}" AS ENUM (${values
           .map((value) => `'${value}'`)
           .join(', ')});
       EXCEPTION WHEN duplicate_object THEN NULL;
       END $$;`,
    );
  }

  async up(queryRunner: QueryRunner): Promise<void> {
    await this.createEnumType(queryRunner, 'ReturnItem_condition_enum', [
      'SELLABLE',
      'DEFECTIVE',
    ]);
    await this.createEnumType(
      queryRunner,
      'InventoryMovements_condition_enum',
      ['SELLABLE', 'DEFECTIVE'],
    );

    if (await this.tableExists(queryRunner, 'ReturnItem')) {
      await queryRunner.query(
        `ALTER TABLE "ReturnItem"
         ADD COLUMN IF NOT EXISTS "condition" "ReturnItem_condition_enum"
         NOT NULL DEFAULT 'SELLABLE'`,
      );
    }

    if (await this.tableExists(queryRunner, 'StoreProduct')) {
      await queryRunner.query(
        `ALTER TABLE "StoreProduct"
         ADD COLUMN IF NOT EXISTS "stockDefective" integer NOT NULL DEFAULT 0`,
      );
    }

    if (await this.tableExists(queryRunner, 'InventoryMovements')) {
      await queryRunner.query(
        `ALTER TABLE "InventoryMovements"
         ADD COLUMN IF NOT EXISTS "condition" "InventoryMovements_condition_enum" NULL`,
      );
    }

    await queryRunner.query(
      `GRANT USAGE ON TYPE "ReturnItem_condition_enum", "InventoryMovements_condition_enum" TO app_runtime`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await this.tableExists(queryRunner, 'InventoryMovements')) {
      await queryRunner.query(
        `ALTER TABLE "InventoryMovements" DROP COLUMN IF EXISTS "condition"`,
      );
    }
    if (await this.tableExists(queryRunner, 'StoreProduct')) {
      await queryRunner.query(
        `ALTER TABLE "StoreProduct" DROP COLUMN IF EXISTS "stockDefective"`,
      );
    }
    if (await this.tableExists(queryRunner, 'ReturnItem')) {
      await queryRunner.query(
        `ALTER TABLE "ReturnItem" DROP COLUMN IF EXISTS "condition"`,
      );
    }
    await queryRunner.query(
      `DROP TYPE IF EXISTS "InventoryMovements_condition_enum"`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "ReturnItem_condition_enum"`);
  }
}
