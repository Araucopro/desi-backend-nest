export interface PermissionCatalogEntry {
  key: string;
  subject: string;
  action: string;
  supportsOwnScope: boolean;
  description: string;
}

/**
 * Catálogo global e inmutable de permisos. Es la fuente de verdad del runtime:
 * GET /roles/permissions expone exactamente estas claves y el seed de roles
 * protegidos (ensureTenantRoles) valida contra ellas antes de escribir.
 *
 * Las migraciones versionadas NO deben importar esta constante: deben mantener
 * su propia copia congelada para no cambiar migraciones ya aplicadas.
 */
export const PERMISSION_CATALOG: readonly PermissionCatalogEntry[] = [
  {
    key: 'sales:read',
    subject: 'Sale',
    action: 'read',
    supportsOwnScope: true,
    description: 'Ver ventas',
  },
  {
    key: 'sales:write',
    subject: 'Sale',
    action: 'write',
    supportsOwnScope: true,
    description: 'Crear ventas',
  },
  {
    key: 'sales:convert',
    subject: 'Sale',
    action: 'convert',
    supportsOwnScope: true,
    description: 'Convertir ventas',
  },
  {
    key: 'dispatch-guides:read',
    subject: 'DispatchGuide',
    action: 'read',
    supportsOwnScope: true,
    description: 'Ver guías de despacho',
  },
  {
    key: 'dispatch-guides:write',
    subject: 'DispatchGuide',
    action: 'write',
    supportsOwnScope: true,
    description: 'Crear guías de despacho',
  },
  {
    key: 'dispatch-guides:reconcile',
    subject: 'DispatchGuide',
    action: 'reconcile',
    supportsOwnScope: true,
    description: 'Reconciliar guías',
  },
  {
    key: 'dispatch-guides:anular',
    subject: 'DispatchGuide',
    action: 'anular',
    supportsOwnScope: true,
    description: 'Anular guías',
  },
  {
    key: 'returns:read',
    subject: 'Return',
    action: 'read',
    supportsOwnScope: true,
    description: 'Ver devoluciones',
  },
  {
    key: 'returns:write',
    subject: 'Return',
    action: 'write',
    supportsOwnScope: true,
    description: 'Crear devoluciones',
  },
  {
    key: 'returns:approve',
    subject: 'Return',
    action: 'approve',
    supportsOwnScope: true,
    description: 'Aprobar devoluciones',
  },
  {
    key: 'returns:reject',
    subject: 'Return',
    action: 'reject',
    supportsOwnScope: true,
    description: 'Rechazar devoluciones',
  },
  {
    key: 'returns:cancel',
    subject: 'Return',
    action: 'cancel',
    supportsOwnScope: true,
    description: 'Cancelar devoluciones',
  },
  {
    key: 'returns:reconcile',
    subject: 'Return',
    action: 'reconcile',
    supportsOwnScope: true,
    description: 'Reconciliar devoluciones',
  },
  {
    key: 'dte:read',
    subject: 'DteDocument',
    action: 'read',
    supportsOwnScope: false,
    description: 'Ver documentos DTE',
  },
  {
    key: 'dte:reconcile',
    subject: 'DteDocument',
    action: 'reconcile',
    supportsOwnScope: false,
    description: 'Reconciliar documentos DTE',
  },
  {
    key: 'users:manage',
    subject: 'User',
    action: 'manage',
    supportsOwnScope: false,
    description: 'Administrar usuarios',
  },
  {
    key: 'stores:manage',
    subject: 'Store',
    action: 'manage',
    supportsOwnScope: false,
    description: 'Administrar tiendas',
  },
  {
    key: 'stores:read',
    subject: 'Store',
    action: 'read',
    supportsOwnScope: false,
    description: 'Ver tiendas',
  },
  {
    key: 'stores:bypass-scope',
    subject: 'Store',
    action: 'bypass-scope',
    supportsOwnScope: false,
    description: 'Operar sin asignación de tienda',
  },
  {
    key: 'userstores:manage',
    subject: 'UserStore',
    action: 'manage',
    supportsOwnScope: false,
    description: 'Administrar asignaciones de tienda',
  },
  {
    key: 'roles:manage',
    subject: 'Role',
    action: 'manage',
    supportsOwnScope: false,
    description: 'Administrar roles y permisos',
  },
  {
    key: 'clients:read',
    subject: 'Client',
    action: 'read',
    supportsOwnScope: false,
    description: 'Ver clientes',
  },
  {
    key: 'clients:manage',
    subject: 'Client',
    action: 'manage',
    supportsOwnScope: false,
    description: 'Administrar clientes',
  },
];

/**
 * Permisos base que reciben los roles protegidos STORE_MANAGER, CONSIGNADO y
 * TERCERO durante el provisioning. Cada clave debe existir en PERMISSION_CATALOG.
 */
export const BASE_PERMISSION_KEYS: readonly string[] = [
  'sales:read',
  'sales:write',
  'sales:convert',
  'dispatch-guides:read',
  'dispatch-guides:write',
  'returns:read',
  'returns:write',
  'dte:read',
  'stores:read',
  'clients:read',
];
