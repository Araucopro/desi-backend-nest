import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Etapa 2 – Wrappers y Seguridad
 *
 * Añade índices compuestos (tenantID, id) en las tablas de negocio
 * para que las políticas RLS que filtran por tenantID sean eficientes.
 * No añade FK cross-tabla a tenants por ahora: la integridad de
 * tenantID se garantiza en la capa de aplicación vía TenantContextService.
 */
export class CompositeIndexesRls20260723000200 implements MigrationInterface {
  name = 'CompositeIndexesRls20260723000200';

  private readonly businessTables: Array<{ table: string; pk: string }> = [
    { table: 'products', pk: 'productID' },
    { table: 'product_variations', pk: 'variationID' },
    { table: 'categories', pk: 'categoryID' },
    { table: 'stores', pk: 'storeID' },
    { table: 'store_products', pk: 'storeProductID' },
    { table: 'inventory_movements', pk: 'inventoryMovementID' },
    { table: 'purchase_orders', pk: 'purchaseOrderID' },
    { table: 'purchase_order_items', pk: 'purchaseOrderItemID' },
    { table: 'transfers', pk: 'transferID' },
    { table: 'transfer_items', pk: 'transferItemID' },
    { table: 'expenses', pk: 'expenseID' },
    { table: 'dte_documents', pk: 'dteDocumentID' },
    { table: 'special_offers', pk: 'offerID' },
    { table: 'store_monthly_targets', pk: 'storeMonthlyTargetID' },
    { table: 'user_stores', pk: 'userStoreID' },
  ];

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const { table, pk } of this.businessTables) {
      const exists = await queryRunner.query(
        `SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = $1`,
        [table],
      );
      if (!exists || (exists as unknown[]).length === 0) continue;

      // Índice compuesto (tenantID, pk) – acelera lookup por tenant + pk primario
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "${table}_tenant_pk_idx"
         ON "${table}" ("tenantID", "${pk}")`,
      );
    }

    // Asegurar que las tablas master nunca estén bajo políticas de tenant
    await queryRunner.query(`ALTER TABLE tenants DISABLE ROW LEVEL SECURITY`);
    await queryRunner.query(
      `ALTER TABLE master_users DISABLE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `ALTER TABLE audit_events DISABLE ROW LEVEL SECURITY`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const { table } of this.businessTables) {
      await queryRunner.query(
        `DROP INDEX IF EXISTS "${table}_tenant_pk_idx"`,
      );
    }
    // Restaurar RLS en tablas master (estado previo de la migración 0100)
    await queryRunner.query(`ALTER TABLE tenants ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(
      `ALTER TABLE master_users ENABLE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY`,
    );
  }
}
