# Etapa 01 — Fundación multitenant con RLS

Fecha: 2026-07-27
Rama: trabajo local de implementación

## Resultado

Se incorporó el límite de seguridad por `tenantID` para las entidades de negocio, el catálogo `tenants`, usuarios MASTER y `audit_events`. El contexto se resuelve desde `X-Tenant-ID` y el JWT; ambos valores deben coincidir. Las operaciones transaccionales usan `SET LOCAL app.tenant_id` y PostgreSQL aplica políticas RLS con `FORCE ROW LEVEL SECURITY`.

## Cambios principales

- `src/multitenant`: entidades master, contexto AsyncLocalStorage, guard/interceptor, servicio MASTER e impersonación auditada.
- `src/auth`: payload tenant/master, validación del tenant en login y guard MASTER.
- `src/users`, `src/stores`, `src/relations/userstores`: `tenantID`, creación de tienda central y operaciones piloto dentro del contexto.
- Todas las entidades comerciales incluyen `tenantID`; se eliminaron referencias fijas a `public` en entidades piloto.
- `synchronize` está desactivado. La migración inicial es `src/datasource/migrations/20260723000100-foundation-rls.ts`.

## RLS y runtime

La migración crea `app_runtime` sin `BYPASSRLS`, habilita y fuerza RLS en tablas tenant, agrega índices por tenant y concede solo privilegios DML. El propietario/migrador debe ser distinto del usuario runtime (`PG_OWNER_USER`/`PG_OWNER_PASSWORD` frente a `PG_RUNTIME_USER`/`PG_RUNTIME_PASSWORD`).

## Configuración

Usar `DATABASE_URL` o `PG*`, además de `JWT_SECRET`, `PG_RUNTIME_USER`, `PG_RUNTIME_PASSWORD`, `PG_OWNER_USER`, `PG_OWNER_PASSWORD`, `PG_APP_NAME` y `RLS_ENABLED`. No guardar credenciales reales en el repositorio.

## Ejecución desde base vacía

1. Crear la base y ejecutar `pnpm install`.
2. Ejecutar `pnpm exec typeorm migration:run -d dist/datasource/data-source.js` después de `pnpm build`, usando credenciales propietarias.
3. Configurar la aplicación con el rol runtime y arrancar con `pnpm start:prod`.
4. Crear/activar tenants mediante la superficie MASTER y enviar `X-Tenant-ID` en login y rutas tenant.

La migración inicial crea el esquema de entidades como parte de una operación versionada para soportar la base nueva; el proceso de arranque no modifica el esquema.

## Verificación realizada

- `pnpm exec tsc --noEmit`: OK.

No se ejecutaron pruebas de integración PostgreSQL en este entorno porque no se detectó una instancia PostgreSQL disponible. La suite A/B, concurrencia, suspensión y privilegios del rol runtime debe ejecutarse contra PostgreSQL real en CI antes de promover la etapa.

## Resumen de cambios principales:

- RLS multitenant con tenantID en entidades de negocio.
- Contexto tenant vía X-Tenant-ID + JWT.
- SET LOCAL app.tenant_id dentro de transacciones.
- Entidades Tenant, MasterUser y AuditEvent.
- Guards MASTER y tenant, impersonación auditada.
- Límites de 5 usuarios y 5 tiendas con bloqueo pesimista.
- synchronize: false y migración inicial.
- Rol runtime app_runtime sin BYPASSRLS.
- Documentación en multitenant/ETAPA-01-FUNDACION-RLS.md.

## Pendientes Etapa 2

- Completar el wrapper transaccional en todos los módulos comerciales y eliminar accesos directos a `DataSource.manager`.
- Agregar login MASTER/bootstrap seguro y pruebas e2e A/B contra PostgreSQL real.
- Añadir foreign keys compuestas `(tenantID, id)` en relaciones críticas y límites concurrentes de tiendas/usuarios.
- Proteger o retirar rutas públicas heredadas de seed y módulos comerciales.
