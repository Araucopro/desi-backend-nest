import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Etapa 3 – Provisioning, Onboarding y Control de Ciclo de Vida
 *
 * Imprime restricción NOT NULL sobre la columna "tenantID" en todas
 * las tablas comerciales y crea índices únicos compuestos para integridad.
 */
export class EnforceTenantNotNullAndFk20260724000300 implements MigrationInterface {
  name = 'EnforceTenantNotNullAndFk20260724000300';

  private readonly businessTables: string[] = [
    'products',
    'product_variations',
    'categories',
    'Store',
    'store_products',
    'inventory_movements',
    'purchase_orders',
    'purchase_order_items',
    'transfers',
    'transfer_items',
    'expenses',
    'dte_documents',
    'special_offers',
    'store_monthly_targets',
    'UserStore',
    'Users',
  ];

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of this.businessTables) {
      const exists = await queryRunner.query(
        `SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = $1`,
        [table],
      );
      if (!exists || (exists as unknown[]).length === 0) continue;

      // Asignar default UUID en caso de nulos preexistentes antes de NOT NULL
      await queryRunner.query(
        `UPDATE "${table}" SET "tenantID" = '00000000-0000-0000-0000-000000000000' WHERE "tenantID" IS NULL`,
      );

      // Enforce NOT NULL
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "tenantID" SET NOT NULL`,
      );
    }

    // Unique composite index en Store (tenantID, storeID)
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "store_tenant_store_id_uq" ON "Store" ("tenantID", "storeID")`,
    );

    // Unique composite index en Users (tenantID, userID)
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "users_tenant_user_id_uq" ON "Users" ("tenantID", "userID")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "users_tenant_user_id_uq"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "store_tenant_store_id_uq"`);

    for (const table of this.businessTables) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "tenantID" DROP NOT NULL`,
      );
    }
  }
}
