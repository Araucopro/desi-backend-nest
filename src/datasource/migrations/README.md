# Convención RBAC para migraciones

Las funciones `protect_system_role` y `protect_system_role_permissions` bloquean
al usuario de runtime `app_runtime`, pero permiten operaciones realizadas por
el owner o rol privilegiado que ejecuta migraciones versionadas.

Las migraciones futuras que agreguen permisos al rol `TENANT_ADMIN` deben hacer
el seed normalmente. No deben usar `DISABLE TRIGGER`. `app_runtime` no puede
activar un bypass mediante una variable de sesión.

Las validaciones de `supportsOwnScope` permanecen activas también para roles
privilegiados; un seed debe usar únicamente scopes compatibles con el catálogo.

El datasource CLI usa `migrationsTransactionMode: 'each'`. La migración
`20260828000300-normalize-system-role` declara además `public transaction =
false`, porque PostgreSQL no permite consumir un valor enum nuevo antes de que
termine la transacción que lo agregó. Ejecuta `pnpm build` antes de
`pnpm migration:run` para que el CLI use la migración compilada actualizada.
