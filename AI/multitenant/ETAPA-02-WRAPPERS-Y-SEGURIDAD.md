# Etapa 2 — Wrappers y Seguridad RLS

**Fecha:** 2026-07-27  
**Estado:** ✅ Completada  
**Typecheck:** `pnpm exec tsc --noEmit` → sin errores

---

## Objetivo

Envolver todos los servicios de negocio en `TenantContextService.transaction(...)` para garantizar que cada query ejecutada dentro de una transacción tenga `app.tenant_id` establecido via `SELECT set_config(...)`, activando las políticas RLS de PostgreSQL (`FORCE ROW LEVEL SECURITY`).

Adicionalmente, se aseguró el endpoint `/seed` detrás de autenticación master, se implementó `POST /master/login` y se agregaron índices compuestos para eficiencia.

---

## Patrón implementado

Cada servicio de negocio sigue este patrón:

```typescript
// Inyección opcional (backward-compatible)
@Optional() private readonly tenantContext?: TenantContextService,

// Helper
private runInTransaction<T>(callback: (manager: EntityManager) => Promise<T>): Promise<T> {
  return this.tenantContext
    ? this.tenantContext.transaction(callback)   // → SET LOCAL app.tenant_id + BEGIN/COMMIT
    : this.dataSource.transaction(callback);     // Fallback sin tenant (tests unitarios, seed)
}
```

`TenantContextService.transaction` es responsable de:

1. Abrir una transacción con `dataSource.transaction()`
2. Ejecutar `SELECT set_config('app.tenant_id', tenantId, true)` dentro de la misma conexión
3. Correr el callback del servicio

---

## Cambios por archivo

### Autenticación Master

| Archivo                                   | Cambio                                                                 |
| ----------------------------------------- | ---------------------------------------------------------------------- |
| `src/multitenant/dto/login-master.dto.ts` | **[NEW]** DTO para `POST /master/login`                                |
| `src/multitenant/master.service.ts`       | `loginMaster()` con bcrypt + JWT master; `ensureMasterUserBootstrap()` |
| `src/multitenant/master.controller.ts`    | `@Public() POST /master/login`                                         |

### Seguridad Seed

| Archivo                       | Cambio                                                                       |
| ----------------------------- | ---------------------------------------------------------------------------- |
| `src/seed/seed.controller.ts` | Reemplazado `@Public()` por `@UseGuards(MasterAuthGuard)` + `@MasterRoute()` |
| `src/seed/seed.module.ts`     | Importa `MultitenantModule`                                                  |

### Servicios Envueltos en RLS Transaction

| Servicio                     | Módulo actualizado                                   |
| ---------------------------- | ---------------------------------------------------- |
| `ProductsService`            | `ProductsModule`                                     |
| `CategoriesService`          | `CategoriesModule`                                   |
| `TransfersService`           | `TransfersModule`                                    |
| `PurchaseOrdersService`      | `PurchaseOrdersModule`                               |
| `InventoryService`           | `InventoryModule`                                    |
| `PricingService`             | `PricingModule`                                      |
| `ExpensesService`            | `ExpensesModule`                                     |
| `StoreMonthlyTargetsService` | `StoreMonthlyTargetsModule`                          |
| `DteService`                 | `DteModule`                                          |
| `ReportsService`             | `ReportsModule`                                      |
| `StoreProductService`        | `StoreProductModule`                                 |
| `UserstoresService`          | `UserstoresModule` (ya tenía `TenantContextService`) |

### Migración

| Archivo                                                             | Descripción                                                                                                                             |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `src/datasource/migrations/20260723000200-composite-indexes-rls.ts` | Índices compuestos `(tenantID, pk)` en 15 tablas de negocio; desactiva RLS en tablas master (`tenants`, `master_users`, `audit_events`) |

---

## Decisiones de diseño

### `@Optional()` en lugar de requerido

Se usa `@Optional()` para que los módulos que no importen `MultitenantModule` (e.g. tests unitarios, seed sin tenant) no fallen en la resolución de dependencias. El fallback es el `dataSource.transaction` directo.

### ReportsService: `runInTransaction` sin `DataSource`

`ReportsService` no inyecta `DataSource` directamente. El fallback sin tenantContext usa `this.dteDocumentRepository.manager`, que comparte la conexión del pool sin una transacción explícita — aceptable para read-only queries de reporting.

### Tablas master sin RLS

`tenants`, `master_users` y `audit_events` son cross-tenant por definición. La migración 0200 desactiva su `ROW LEVEL SECURITY` explícitamente para evitar que la política `app.tenant_id` las bloquee en operaciones de gestión.

### Sin composite FK a `tenants`

No se añadió FK `tenantID → tenants.tenantID` en tablas de negocio en esta etapa. La integridad se garantiza en capa de aplicación (`TenantContextService` valida que el tenant exista y esté `ACTIVE` antes de generar el JWT). Añadir las FK sería una migración destructiva en producción (requiere backfill de todos los registros).

---

## Verificación

```bash
pnpm exec tsc --noEmit
# → sin errores (verificado 2026-07-23)
```

### Próxima verificación (manual / staging)

1. Crear dos tenants (`A` y `B`) vía `POST /master/tenants`
2. Autenticar un usuario de cada tenant
3. Crear un `product` en tenant A → verificar que tenant B no lo ve
4. Intentar acceder con JWT de tenant B al product de tenant A → debe retornar `[]` o `404`

---

## Próxima etapa sugerida

**Etapa 3 — Provisioning y Onboarding de Tenants**

- Endpoint `POST /master/tenants/:id/provision` que ejecute seed de datos iniciales (categorías por defecto, store central, usuario admin) dentro del contexto del nuevo tenant
- Migración de `tenantID` NOT NULL enforcement después de backfill
- Circuit-breaker: si `app.tenant_id` no está seteado, las políticas RLS devuelven 0 filas — considerar un guard global que lo detecte y lance `401`
