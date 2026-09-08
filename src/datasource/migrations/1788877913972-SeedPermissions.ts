import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Copia congelada del catálogo de permisos al momento de crear esta migración.
 * NO importar permission-catalog.constants.ts (ver README de migraciones).
 */
const PERMISSIONS = [
  {
    key: 'sales:read',
    subject: 'Ventas',
    action: 'read',
    supportsOwnScope: true,
    description: 'Ver ventas',
  },
  {
    key: 'sales:write',
    subject: 'Ventas',
    action: 'write',
    supportsOwnScope: true,
    description: 'Crear ventas',
  },
  {
    key: 'sales:convert',
    subject: 'Ventas',
    action: 'convert',
    supportsOwnScope: true,
    description: 'Convertir ventas',
  },
  {
    key: 'dispatch-guides:read',
    subject: 'GuiasDespacho',
    action: 'read',
    supportsOwnScope: true,
    description: 'Ver guías de despacho',
  },
  {
    key: 'dispatch-guides:write',
    subject: 'GuiasDespacho',
    action: 'write',
    supportsOwnScope: true,
    description: 'Crear guías de despacho',
  },
  {
    key: 'dispatch-guides:reconcile',
    subject: 'GuiasDespacho',
    action: 'reconcile',
    supportsOwnScope: true,
    description: 'Reconciliar guías',
  },
  {
    key: 'dispatch-guides:anular',
    subject: 'GuiasDespacho',
    action: 'anular',
    supportsOwnScope: true,
    description: 'Anular guías',
  },
  {
    key: 'returns:read',
    subject: 'Devoluciones',
    action: 'read',
    supportsOwnScope: true,
    description: 'Ver devoluciones',
  },
  {
    key: 'returns:write',
    subject: 'Devoluciones',
    action: 'write',
    supportsOwnScope: true,
    description: 'Crear devoluciones',
  },
  {
    key: 'returns:approve',
    subject: 'Devoluciones',
    action: 'approve',
    supportsOwnScope: true,
    description: 'Aprobar devoluciones',
  },
  {
    key: 'returns:reject',
    subject: 'Devoluciones',
    action: 'reject',
    supportsOwnScope: true,
    description: 'Rechazar devoluciones',
  },
  {
    key: 'returns:cancel',
    subject: 'Devoluciones',
    action: 'cancel',
    supportsOwnScope: true,
    description: 'Cancelar devoluciones',
  },
  {
    key: 'returns:reconcile',
    subject: 'Devoluciones',
    action: 'reconcile',
    supportsOwnScope: true,
    description: 'Reconciliar devoluciones',
  },
  {
    key: 'dte:read',
    subject: 'DocumentosTributarios',
    action: 'read',
    supportsOwnScope: false,
    description: 'Ver documentos DTE',
  },
  {
    key: 'dte:reconcile',
    subject: 'DocumentosTributarios',
    action: 'reconcile',
    supportsOwnScope: false,
    description: 'Reconciliar documentos DTE',
  },
  {
    key: 'users:manage',
    subject: 'Usuarios',
    action: 'manage',
    supportsOwnScope: false,
    description: 'Administrar usuarios',
  },
  {
    key: 'stores:manage',
    subject: 'Tiendas',
    action: 'manage',
    supportsOwnScope: false,
    description: 'Administrar tiendas',
  },
  {
    key: 'stores:read',
    subject: 'Tiendas',
    action: 'read',
    supportsOwnScope: false,
    description: 'Ver tiendas',
  },
  {
    key: 'stores:bypass-scope',
    subject: 'Tiendas',
    action: 'bypass-scope',
    supportsOwnScope: false,
    description: 'Operar sin asignación de tienda',
  },
  {
    key: 'userstores:manage',
    subject: 'AsignacionUsuariosyTiendas',
    action: 'manage',
    supportsOwnScope: false,
    description: 'Administrar asignaciones de tienda',
  },
  {
    key: 'roles:manage',
    subject: 'Roles',
    action: 'manage',
    supportsOwnScope: false,
    description: 'Administrar roles y permisos',
  },
  {
    key: 'clients:read',
    subject: 'Clientes',
    action: 'read',
    supportsOwnScope: false,
    description: 'Ver clientes',
  },
  {
    key: 'clients:manage',
    subject: 'Clientes',
    action: 'manage',
    supportsOwnScope: false,
    description: 'Administrar clientes',
  },
] as const;

export class SeedPermissions1788877913972 implements MigrationInterface {
  name = 'SeedPermissions1788877913972';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const p of PERMISSIONS) {
      await queryRunner.query(
        `INSERT INTO "permissions" ("key", "subject", "action", "supportsOwnScope", "description")
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT ("key") DO NOTHING`,
        [p.key, p.subject, p.action, p.supportsOwnScope, p.description],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const keys = PERMISSIONS.map((p) => p.key);
    await queryRunner.query(`DELETE FROM "permissions" WHERE "key" = ANY($1)`, [
      keys,
    ]);
  }
}
