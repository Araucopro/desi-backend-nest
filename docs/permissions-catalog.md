# Catálogo de permisos (RBAC)

El catálogo de permisos es **global, fijo e inmutable**: los tenants no pueden
crearlo ni modificarlo. Se puebla por migraciones versionadas y se expone en
solo lectura a través de `GET /roles/permissions` (requiere el permiso
`roles:manage`).

Las claves de este documento son las que el frontend debe usar para validar el
mapa de navegación y el gateo por permisos. No inferir claves nuevas: si una
función necesita un permiso que no existe en esta tabla, debe agregarse al
catálogo con una migración y coordinarse con el equipo de backend.

| key | subject | action | supportsOwnScope | description |
| --- | --- | --- | --- | --- |
| `sales:read` | Sale | read | true | Ver ventas |
| `sales:write` | Sale | write | true | Crear ventas |
| `sales:convert` | Sale | convert | true | Convertir ventas |
| `dispatch-guides:read` | DispatchGuide | read | true | Ver guías de despacho |
| `dispatch-guides:write` | DispatchGuide | write | true | Crear guías de despacho |
| `dispatch-guides:reconcile` | DispatchGuide | reconcile | true | Reconciliar guías |
| `dispatch-guides:anular` | DispatchGuide | anular | true | Anular guías |
| `returns:read` | Return | read | true | Ver devoluciones |
| `returns:write` | Return | write | true | Crear devoluciones |
| `returns:approve` | Return | approve | true | Aprobar devoluciones |
| `returns:reject` | Return | reject | true | Rechazar devoluciones |
| `returns:cancel` | Return | cancel | true | Cancelar devoluciones |
| `returns:reconcile` | Return | reconcile | true | Reconciliar devoluciones |
| `dte:read` | DteDocument | read | false | Ver documentos DTE |
| `dte:reconcile` | DteDocument | reconcile | false | Reconciliar documentos DTE |
| `users:manage` | User | manage | false | Administrar usuarios |
| `stores:manage` | Store | manage | false | Administrar tiendas |
| `stores:read` | Store | read | false | Ver tiendas |
| `stores:bypass-scope` | Store | bypass-scope | false | Operar sin asignación de tienda |
| `userstores:manage` | UserStore | manage | false | Administrar asignaciones de tienda |
| `roles:manage` | Role | manage | false | Administrar roles y permisos |

## Roles protegidos y claves asignadas en el provisioning

- `TENANT_ADMIN` (admin): todas las claves del catálogo, scope `ALL`.
- `STORE_MANAGER` (store_manager): claves base, scope `ALL`.
- `CONSIGNADO` (consignado): claves base, scope `ALL`.
- `TERCERO` (tercero): claves base, scope `ALL`.
- `SYSTEM` (system): sin permisos asignados.

Claves base: `sales:read`, `sales:write`, `sales:convert`,
`dispatch-guides:read`, `dispatch-guides:write`, `returns:read`,
`returns:write`, `dte:read`, `stores:read`.

## Fuente de verdad en código

El runtime consume `src/roles/permission-catalog.constants.ts`. Las migraciones
mantienen su propia copia congelada del catálogo: **no** se importa la constante
desde una migración, para no alterar migraciones ya aplicadas.
