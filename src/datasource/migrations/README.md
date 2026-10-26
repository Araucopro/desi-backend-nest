# Convención RBAC para migraciones

Las funciones `protect_system_role` y `protect_system_role_permissions` bloquean
al usuario de runtime `app_runtime`, pero permiten operaciones realizadas por
el owner o rol privilegiado que ejecuta migraciones versionadas.

Las migraciones futuras que agreguen permisos al rol `TENANT_ADMIN` deben hacer
el seed normalmente. No deben usar `DISABLE TRIGGER`. `app_runtime` no puede
activar un bypass mediante una variable de sesión.

Las validaciones de `supportsOwnScope` permanecen activas también para roles
privilegiados; un seed debe usar únicamente scopes compatibles con el catálogo.

Ejecuta `pnpm build` antes de
`pnpm migration:run` para que el CLI use la migración compilada actualizada.

## Railway: migrar antes de arrancar

`railway.json` declara `npm run migration:run` como comando pre-deploy. Railway
lo ejecuta despues de compilar la imagen y antes de arrancar la nueva version.
Si falla, el despliegue no continua: revisar el log de pre-deploy. Las migraciones
aplicadas quedan registradas por TypeORM y no se ejecutan otra vez.

Los scripts `migration:run` y `migration:show` usan `--env-file-if-exists=.env`:
el archivo local es opcional, porque la imagen Docker no lo contiene y Railway
inyecta las variables del servicio. `synchronize` y `migrationsRun` de la API
siguen desactivados; la actualizacion se realiza con migraciones versionadas.

Conexion del CLI, en orden de prioridad:

1. `MIGRATION_DATABASE_URL`, si esta configurada.
2. `DATABASE_URL`, si esta configurada.
3. `PGHOST`, `PGPORT`, `PGDATABASE`, con `PG_OWNER_USER` / `PG_OWNER_PASSWORD`
   o, como alternativa, `PGUSER` / `PGPASSWORD`.

Si `DATABASE_URL` pertenece a `app_runtime`, configurar `MIGRATION_DATABASE_URL`
con la conexion del propietario de **la misma base de datos**. No ampliar permisos
de `app_runtime` para crear tablas o modificar el esquema. La API conserva su
conexion de runtime; la conexion privilegiada solo la usa el CLI de migraciones.

Antes del primer despliegue con este paso, revisar `npm run migration:show` en
el entorno correspondiente: el comando pre-deploy aplica todas las pendientes,
no solo las de ecommerce. No usar `migration:fresh` ni `schema:drop` para corregir
la falta de una tabla en una base existente.

Para `relation "commerce_channels" does not exist`, las migraciones existentes
`CreateCommerceChannels1790900000000` y `CreateCommerceOrders1791000000000`
crean la tabla y sus campos de ventas. `AddChannelPhotoRequirement1792965600000`
agrega el requisito de foto por canal. Deben figurar aplicadas en la misma base
que consulta el backend.

En Railway, el servicio debe usar el `railway.json` de la raiz de este repo.
Si tiene un Config File Path personalizado, cambiarlo a `/railway.json`. El paso
no configura otro proyecto ni corrige una conexion a una base equivocada.
