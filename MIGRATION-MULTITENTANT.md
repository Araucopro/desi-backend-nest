# Plan de transformación a sistema multitenant

## 1. Propósito y alcance

Este documento describe el estado actual del backend y los pasos necesarios para convertirlo en una plataforma multitenant: varias organizaciones independientes usando la misma aplicación, con separación de datos, usuarios, configuración, permisos, operaciones, auditoría y ciclo de vida.

El documento es únicamente de análisis y planificación. **No incluye cambios de código ni de base de datos.**

Objetivos de la transformación:

- impedir lecturas, escrituras, actualizaciones, borrados y agregaciones entre tenants;
- distinguir la identidad de plataforma de la identidad de cada tenant;
- permitir que un tenant tenga una o varias tiendas;
- conservar el alcance actual por tienda cuando corresponda;
- provisionar, migrar, suspender, respaldar y eliminar tenants de forma controlada;
- soportar despliegues y migraciones sin depender de `synchronize`;
- hacer verificable el aislamiento mediante pruebas automatizadas y controles de PostgreSQL.

Fuera de alcance inmediato: rediseñar el dominio comercial, cambiar la integración DTE, cambiar los roles existentes o implementar facturación de planes. Esas capacidades deberán quedar preparadas en el diseño, pero pueden desarrollarse después del aislamiento base.

---

## 2. Resumen ejecutivo

El backend es una aplicación NestJS que usa Fastify, TypeORM y PostgreSQL. Tiene una única conexión global y una única colección lógica de tablas. La autenticación emite JWT con `id`, `email` y `role`; el token no identifica tenant. La relación `UserStore` permite asociar usuarios a tiendas, pero una tienda no es un tenant: es una unidad operativa dentro de una organización.

El riesgo principal no es solamente que falte una columna. Actualmente cualquier repositorio global, `findOne` por UUID, query builder, transacción o `EntityManager` puede consultar datos de otra organización si recibe un identificador válido. Además, los reportes y filtros por `storeId` no constituyen aislamiento.

### Recomendación arquitectónica

Adoptar **schema-per-tenant** en PostgreSQL:

- un esquema `master` para el catálogo de tenants, usuarios de plataforma, planes y provisioning;
- un esquema independiente por tenant, por ejemplo `tenant_acme`, con las tablas del dominio actual;
- ningún dato de negocio en `public`;
- resolución del tenant antes de ejecutar cualquier caso de uso;
- acceso a datos mediante un contexto y un `QueryRunner`/wrapper que establezca el `search_path` de forma segura;
- migraciones versionadas para el esquema master y para cada esquema de tenant.

La opción row-level (`tenantId` en cada tabla) también es viable y operacionalmente más simple, pero exige agregar el discriminador a todas las tablas, aplicar el filtro a cada consulta y preferiblemente usar Row-Level Security. Si se elige row-level, no se debe confiar solo en disciplina de los servicios: deben existir políticas RLS, índices compuestos y pruebas de fuga cross-tenant.

---

## 3. Estructura actual

### 3.1 Stack y arranque

- NestJS 11, Fastify 5 y TypeScript.
- TypeORM 0.3 con PostgreSQL (`pg`).
- JWT mediante `@nestjs/jwt` y bcrypt para contraseñas.
- Validación global con `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`).
- `AuthGuard` y `RolesGuard` registrados como guards globales en `src/auth/auth.module.ts`.
- Interceptor de respuesta y filtro global de excepciones.
- Swagger en `/docs` y `/docs-json`.
- Dockerfile con Node 24 y `docker-compose.yml` para un servicio API.

Puntos de entrada relevantes:

- [`src/main.ts`](src/main.ts): bootstrap, CORS, logging y pipes globales.
- [`src/app.module.ts`](src/app.module.ts): composición de todos los módulos.
- [`src/datasource/database.module.ts`](src/datasource/database.module.ts): conexión TypeORM.
- [`src/auth/auth.module.ts`](src/auth/auth.module.ts): JWT y guards globales.

### 3.2 Módulos de negocio

El dominio está organizado por módulos NestJS:

| Área                     | Responsabilidad                              | Dependencias de tenant esperadas                  |
| ------------------------ | -------------------------------------------- | ------------------------------------------------- |
| `users`                  | usuarios, credenciales y perfil              | identidad de tenant; relación con tiendas         |
| `stores`                 | tiendas y tienda central                     | pertenece a un tenant                             |
| `relations/userstores`   | asignación usuario-tienda                    | pertenece a un tenant; debe validar ambos lados   |
| `products`               | productos y variaciones                      | catálogo del tenant                               |
| `categories`             | categorías jerárquicas                       | catálogo del tenant                               |
| `relations/storeproduct` | stock/precios por tienda y variación         | tenant + tienda                                   |
| `inventory`              | movimientos de inventario                    | tenant + tienda                                   |
| `purchase-orders`        | órdenes de compra e ítems                    | tenant + tiendas/productos                        |
| `transfers`              | transferencias entre tiendas                 | tenant + tiendas/productos                        |
| `pricing`                | precios, ofertas e historial                 | tenant + tienda/producto                          |
| `expenses`               | gastos y resúmenes                           | tenant + tienda                                   |
| `reports`                | agregaciones comerciales                     | tenant obligatorio; tienda opcional               |
| `store-monthly-targets`  | metas por tienda/periodo                     | tenant + tienda                                   |
| `dte`                    | documentos tributarios e integración externa | tenant + tienda; secretos por tenant              |
| `seed`                   | carga inicial                                | debe ser operación de provisioning o master admin |

### 3.3 Persistencia actual

La conexión en [`src/datasource/database.module.ts`](src/datasource/database.module.ts) usa `DATABASE_URL` o variables `PG*`, carga entidades automáticamente y tiene `synchronize: true`. Esto es incompatible con un entorno multitenant serio: el arranque no debe alterar el esquema de producción y la creación de tenants debe ser explícita y auditable.

Entidades identificadas en `src/**/entities`:

- `User`, `Store`, `UserStore`;
- `Product`, `ProductVariation`, `Category`;
- `StoreProduct`, `InventoryMovement`;
- `PurchaseOrder`, `PurchaseOrderItem`;
- `StoreTransfer`, `StoreTransferItem`;
- `SpecialOffer`, `PriceHistory`;
- `Expense`, `StoreMonthlyTarget`;
- `DteDocument`.

Hay una mezcla importante de configuración de schema:

- `User`, `Store` y `UserStore` declaran `schema: 'public'`;
- `Expense` también declara schema público;
- varias entidades solo declaran el nombre de tabla y dependen del `search_path`.

Para schema-per-tenant, las entidades de negocio no pueden apuntar permanentemente a `public`. El esquema debe resolverse por conexión/query runner, y las entidades master deben estar separadas de las entidades tenant.

### 3.4 Acceso a datos que requiere auditoría

Se encontraron repositorios inyectados normalmente, además de acceso directo a conexiones o managers:

- `UsersService`: `DataSource.transaction()` y repositorios obtenidos desde el manager;
- `ProductsService`: `EntityManager` inyectado directamente y transacciones propias;
- `PurchaseOrdersService`: `DataSource.transaction()` y múltiples `manager.find/findOne/save`;
- `TransfersService`: transacciones con `DataSource`;
- `DteService`: transacciones y búsquedas con `EntityManager`;
- `PricingService` y `UserDiscountValidator`: acceso a `DataSource.manager`;
- `SeedService`: `DataSource` y `QueryRunner`;
- otros servicios usan repositorios TypeORM con consultas directas.

Estos caminos deben quedar cubiertos por el mecanismo de tenant. Un filtro aplicado solo en los repositorios inyectados no protegerá las consultas que usan `DataSource.manager`, `EntityManager` o `QueryRunner`.

### 3.5 Autenticación y autorización actuales

[`JwtPayload`](src/auth/interfaces/jwt-payload.interface.ts) contiene:

```text
id, email, role
```

El `AuthGuard` verifica firma y expiración, y asigna el payload a `request.user`. El `RolesGuard` comprueba únicamente el rol. No hay:

- `tenantId` en el token;
- estado del tenant al validar el token;
- membresía usuario-tenant;
- selección explícita de tenant;
- separación entre administrador de plataforma y administrador de tenant;
- permisos por tienda como política centralizada;
- revocación o versionado de sesiones.

La lógica actual usa `UserStore` para tiendas. Eso puede mantenerse como autorización secundaria, pero no debe usarse como sustituto de la pertenencia al tenant.

### 3.6 Rutas y superficies que deben clasificarse

La inspección de controladores muestra, entre otros, rutas de autenticación, usuarios, productos, tiendas, compras, reportes, inventario, precios, transferencias, DTE y seed. Se observaron decoradores `@Public()` en rutas de usuarios, productos, seed y DTE. Cada ruta pública debe clasificarse individualmente:

- login y health check pueden ser públicos;
- callbacks o recepción DTE deben usar autenticación de integración, firma, API key por tenant, idempotencia y límites de abuso;
- seed nunca debe quedar público en producción;
- creación inicial de un tenant debe pertenecer al dominio master y requerir autenticación de plataforma;
- lectura pública de productos, si existe como requisito, debe filtrar por tenant/catálogo publicado y no reutilizar un servicio administrativo global.

---

## 4. Modelo objetivo

### 4.1 Conceptos

- **Platform/master**: la plataforma que administra tenants, planes, provisioning y soporte.
- **Tenant**: organización cliente aislada. Es el límite de seguridad y propiedad de los datos.
- **Store**: sucursal o unidad operativa dentro de un tenant.
- **Membership**: vínculo entre usuario y tenant, con rol y estado.
- **Store membership**: vínculo opcional entre una membership y una o más tiendas.
- **Integration credential**: secreto/API key perteneciente a un tenant y, cuando corresponda, a una tienda.

Un usuario puede pertenecer a varios tenants. Por eso no conviene modelar tenant como una propiedad fija del usuario si el producto debe soportar invitaciones o cambio de organización.

### 4.2 Esquemas

```text
master
├── tenants
├── master_users
├── tenant_provisioning_jobs
├── tenant_migrations
├── platform_audit_events
└── optional: billing/subscriptions

tenant_acme
├── users
├── memberships
├── stores
├── products / product_variations / categories
├── store_products / inventory_movements
├── purchase_orders / items
├── transfers / items
├── pricing / expenses / targets
├── dte_documents
└── tenant_audit_events
```

La organización exacta puede conservar nombres actuales durante la migración para reducir riesgo, pero deben eliminarse referencias hardcodeadas a `public` en tablas tenant.

### 4.3 Catálogo master mínimo

`Tenant` debe tener al menos:

- `tenantID` UUID;
- `slug` único y normalizado;
- `schemaName` generado por el backend, nunca aceptado sin validación desde el cliente;
- nombre comercial y datos de contacto;
- estado (`PROVISIONING`, `ACTIVE`, `SUSPENDED`, `DEPROVISIONING`, `DELETED`);
- plan y límites;
- zona horaria y configuración regional;
- timestamps, versión de schema y metadatos de provisioning.

`MasterUser` debe ser independiente de `User`, con roles de plataforma (`SUPER_ADMIN`, `SUPPORT`, por ejemplo) y credenciales separadas. No debe recibir automáticamente acceso a datos tenant sin una operación de soporte explícita y auditable.

### 4.4 Modelo de identidad tenant

Opciones válidas:

1. usuarios replicados dentro de cada schema tenant; simple para aislamiento, más complejo para usuarios multi-tenant;
2. usuarios y memberships en `master`, con datos de negocio en el schema tenant; mejor para SSO/invitaciones;
3. usuarios en cada schema y un directorio master de identidad; compromiso operativo.

Recomendación: mantener un directorio de identidad/membership en `master` y mover los datos operativos de usuario al tenant solo si el dominio lo necesita. Si la primera versión solo permite un tenant por usuario, puede usarse el schema tenant como transición, pero el JWT y los servicios deben seguir modelando explícitamente el tenant.

---

## 5. Resolución del tenant y flujo de una petición

La selección de tenant nunca debe depender únicamente de un `tenantId` enviado en el body ni de un `storeId` enviado por el cliente.

Flujo recomendado:

1. extraer el token o credencial de integración;
2. validar firma, expiración, tipo de token y estado de sesión;
3. resolver tenant desde el token, subdominio o contexto de integración;
4. cargar el tenant desde `master` y comprobar que está `ACTIVE`;
5. verificar que la identidad pertenece al tenant;
6. establecer el contexto request-scoped/`AsyncLocalStorage`;
7. abrir una operación de base de datos con el schema tenant correcto;
8. ejecutar autorización de rol y, cuando aplique, alcance de tienda;
9. ejecutar el caso de uso sin aceptar filtros de tenant del cliente;
10. limpiar el contexto y liberar/resetear la conexión.

El JWT de usuario tenant debería incluir, como mínimo:

```text
type: 'tenant'
sub/userId
tenantId
tenantSchema o una referencia resoluble
membershipId
role
permissionsVersion
sessionVersion
```

El token master debe tener un tipo distinto y jamás ser aceptado por endpoints tenant. Para evitar tokens válidos después de suspender una organización, el guard debe consultar el estado del tenant o usar una versión/epoch de sesión con caché invalidable.

Fuentes posibles para resolver tenant:

- header `X-Tenant-Id`: útil para clientes internos, siempre validado contra el token;
- claim JWT: necesario para evitar ambigüedad en sesión;
- credencial/API key: debe mapearse a un solo tenant y opcionalmente tienda.

Si existen varias fuentes, deben coincidir. Un conflicto debe producir `403`, nunca escoger silenciosamente una de ellas.

---

## 6. Estrategia de persistencia schema-per-tenant

### 6.1 Principio de seguridad

El schema no puede interpolarse directamente desde entrada de usuario. El backend debe resolver `tenantId -> schemaName` desde `master`, validar que el nombre cumple una lista segura y parametrizar valores siempre que PostgreSQL lo permita. Los identificadores SQL requieren una función de quoting controlada; no deben construirse concatenando un slug arbitrario.

### 6.2 Pool y `search_path`

TypeORM entrega conexiones de un pool. Cambiar `search_path` en una conexión y devolverla sin restaurarlo puede hacer que la siguiente petición lea otro tenant. La implementación debe elegir una de estas estrategias y probarla bajo concurrencia:

- `QueryRunner` dedicado por operación/transacción, estableciendo `SET LOCAL search_path` dentro de la transacción;
- conexión dedicada por request con `SET search_path` y restauración garantizada en `finally`;
- DataSources separados por tenant, solo si se controla el límite de pools y la liberación.

No basta con guardar `tenantSchema` en `request.user`. La consulta debe ejecutarse efectivamente en el schema correcto.

### 6.3 Capa de acceso requerida

Crear una abstracción única, por ejemplo `TenantDatabase`/`TenantUnitOfWork`, que permita:

- obtener repositorios dentro del contexto tenant;
- ejecutar transacciones tenant;
- ejecutar SQL con `search_path` seguro;
- impedir el uso accidental del `DataSource` global en servicios tenant;
- distinguir repositorios master de repositorios tenant;
- aplicar timeouts y logging del `tenantId` sin registrar secretos.

Las transacciones actuales de `UsersService`, `ProductsService`, `PurchaseOrdersService`, `TransfersService` y `DteService` deben migrar a esta abstracción. Los validadores y reportes también deben usarla.

---

## 7. Inventario de cambios por dominio

### Identidad, usuarios y tiendas

- separar `MasterUser` de `User`;
- crear `Tenant`, `Membership` y estados de invitación;
- agregar pertenencia tenant en cada consulta de usuario;
- mantener `UserStore` como alcance de tienda, no como límite de tenant;
- impedir que un usuario de tenant A asigne usuarios o tiendas de tenant B;
- revisar la creación automática de usuario/tienda central en `UsersService`;
- definir si el email es único por tenant o global en master.

### Catálogo

`Product`, `ProductVariation` y `Category` deben vivir en el schema tenant. Las restricciones únicas actuales (`name`, `sku`) pasan a ser únicas por tenant de forma natural en schema-per-tenant. Las referencias de categoría, producto y variación deben validarse dentro del mismo tenant.

### Inventario, precios y transferencias

Toda operación debe comprobar tenant de origen y destino. Una transferencia nunca puede unir tiendas de organizaciones distintas. Los índices únicos actuales de `StoreProduct` deben conservarse dentro del schema tenant. Debe revisarse la coexistencia del campo `stock` cacheado con `InventoryMovement` para evitar que la migración cambie saldos.

### Compras, gastos y metas

Los `storeID` recibidos por DTO deben verificarse contra el tenant del contexto. Las búsquedas por UUID deben incluir la relación tenant implícita, y no depender de que el UUID sea difícil de adivinar. Los reportes deben construir sus queries desde el repositorio tenant y tratar `storeId` como filtro secundario.

### DTE e integraciones

- mover documentos y credenciales al tenant correcto;
- no reutilizar `OPENFACTURA_APIKEY` global si cada cliente requiere sus propias credenciales;
- almacenar secretos cifrados o en un secret manager;
- definir endpoint de recepción con API key/firma por tenant;
- conservar idempotencia por tenant, no global accidentalmente;
- validar que `purchaseOrderID`, `storeID` y productos pertenezcan al mismo schema;
- auditar reintentos, respuestas externas y cambios de estado.

### Seed y administración

El seed actual debe transformarse en una operación idempotente de provisioning, ejecutada dentro del schema recién creado. No debe quedar como endpoint público. La administración de tenants debe vivir en un módulo master separado, con autorización de plataforma y auditoría.

---

## 8. Plan de implementación por fases

### Fase 0 — Línea base y bloqueo de riesgos

1. Congelar el modelo actual mediante un backup y un dump verificable.
2. Ejecutar inventario de tablas, constraints, índices, volúmenes y relaciones en PostgreSQL.
3. Registrar qué rutas son públicas y quién las consume.
4. Desactivar `synchronize` en todos los entornos no efímeros.
5. Introducir migraciones TypeORM versionadas y un procedimiento de rollback.
6. Proteger o retirar el endpoint `seed` público.
7. Rotar las credenciales expuestas en archivos `.env` y no documentarlas en el repositorio.
8. Establecer una línea base de tests, lint, build y pruebas de integración.

**Salida:** esquema actual reproducible, secretos saneados, rutas clasificadas y ningún cambio de tenant aún en producción.

### Fase 1 — Definir el contrato de tenant

1. Aprobar si el límite es organización, cuenta comercial o cliente tributario.
2. Definir si un usuario puede pertenecer a múltiples tenants.
3. Definir roles master, roles tenant y permisos por tienda.
4. Definir resolución por subdominio/header/JWT/API key.
5. Definir estados y límites del tenant.
6. Definir política de soporte cross-tenant y auditoría.
7. Definir retención, backup, exportación y borrado.

**Salida:** ADR aprobado y contrato de autenticación/autorización versionado.

### Fase 2 — Construir el plano master

1. Crear entidades/migraciones `Tenant`, `MasterUser`, memberships de identidad y provisioning jobs.
2. Crear `MasterDatabase` o un acceso explícitamente marcado para tablas master.
3. Crear servicio de alta que reserve slug/schema de forma transaccional.
4. Validar nombres de schema, límites, estado y concurrencia.
5. Crear endpoints master protegidos por token master.
6. Crear auditoría de alta, suspensión, reactivación y operación de soporte.

**Salida:** se puede crear y consultar el catálogo de tenants sin tocar tablas de negocio.

### Fase 3 — Contexto y acceso tenant

1. Implementar `TenantContext` con `AsyncLocalStorage` o provider request-scoped.
2. Implementar middleware/interceptor de resolución.
3. Implementar `TenantAuthGuard` separado del `MasterAuthGuard`.
4. Implementar `TenantDatabase`/`TenantUnitOfWork`.
5. Prohibir dependencias directas a `DataSource.manager` en módulos tenant.
6. Definir logging con `requestId`, `tenantId`, usuario y tienda, sin contraseñas ni tokens.
7. Añadir protección ante contextos ausentes: un servicio tenant sin contexto debe fallar cerrado.

**Salida:** una prueba de contexto demuestra que dos peticiones concurrentes usan schemas distintos sin contaminación.

### Fase 4 — Migraciones y provisioning de schema

1. Separar migraciones master de migraciones tenant.
2. Crear migración tenant inicial a partir del esquema real, no de `synchronize`.
3. Eliminar `schema: 'public'` de entidades tenant y evitar dependencias implícitas a public.
4. Provisionar un schema nuevo.
5. Ejecutar migraciones tenant en orden.
6. Ejecutar seed idempotente de datos base y tienda central.
7. Registrar versión de migración por tenant.
8. Hacer provisioning reintentable y compensable si falla en mitad del proceso.

El `search_path` esperado para una operación tenant debe ser explícito, por ejemplo `tenant_acme, master, public` solo si el uso de `public` está aprobado y no contiene datos de negocio. Las funciones/extensiones compartidas deben instalarse con una migración de plataforma, no accidentalmente por tenant.

**Salida:** un tenant nuevo queda listo desde cero sin intervención manual y sin leer datos de otro tenant.

### Fase 5 — Migrar el dominio por cortes verticales

Orden sugerido:

1. identidad, usuarios, memberships y tiendas;
2. categorías, productos y variaciones;
3. productos por tienda, inventario y precios;
4. compras, transferencias y metas;
5. gastos y reportes;
6. DTE e integraciones;
7. seed y operaciones administrativas.

Para cada módulo:

- eliminar acceso global no encapsulado;
- resolver tenant desde contexto, no desde DTO;
- validar que todos los IDs relacionados pertenecen al tenant;
- adaptar transacciones al `TenantUnitOfWork`;
- revisar `findOne`, `update`, `delete`, `remove` y query builders;
- revisar joins y subconsultas;
- actualizar tests unitarios con tenant A/B;
- añadir prueba de autorización por rol y tienda.

### Fase 6 — Migrar datos existentes

1. Crear un tenant legado, por ejemplo `legacy`, en estado `PROVISIONING`.
2. Crear su schema y validar la migración tenant.
3. Copiar tablas respetando UUIDs y relaciones.
4. Convertir el usuario/tienda central inicial según el nuevo modelo.
5. Ejecutar conteos, sumas, checksums y validaciones de foreign keys.
6. Comparar reportes históricos antes y después.
7. Hacer un ensayo con restauración y rollback.
8. Ejecutar una ventana de corte con escrituras detenidas o doble escritura controlada.
9. Activar el tenant legado y mantener el esquema antiguo en solo lectura hasta cerrar la validación.

No se deben modificar datos productivos usando `synchronize: true`, scripts no versionados o migraciones irreversibles sin backup.

### Fase 7 — Operación y endurecimiento

- métricas por tenant: latencia, errores, queries lentas, uso y límites;
- trazabilidad de cada operación sensible;
- rate limit por tenant y por integración;
- backups y restauración individual por schema;
- proceso de suspensión que bloquee tokens y APIs;
- exportación de datos por tenant;
- borrado lógico y, si se requiere, borrado físico con doble confirmación;
- alertas ante cambio inesperado de `search_path`;
- revisión de permisos del usuario PostgreSQL;
- pruebas de carga con tenants grandes y pequeños;
- estrategia para tenants que requieran una base dedicada en el futuro.

---

## 9. Si se elige row-level en lugar de schema-per-tenant

La alternativa debe seguir estos pasos:

1. crear `tenants` y `tenantId`/`tenantID` en todas las tablas de negocio, incluidas tablas puente y documentos;
2. poblar el tenant legado durante una migración controlada;
3. agregar foreign keys a `tenants` y constraints compuestos para impedir relaciones cross-tenant;
4. cambiar índices únicos globales a índices que incluyan tenant;
5. aplicar políticas PostgreSQL RLS basadas en `current_setting('app.tenant_id')`;
6. establecer la variable con `SET LOCAL` dentro de cada transacción;
7. impedir que el cliente establezca directamente la variable;
8. encapsular repositorios para que RLS y filtros de aplicación sean redundantes;
9. probar cada operación con dos tenants y un ID cruzado.

No se recomienda una solución row-level sin RLS, porque el código actual contiene muchos accesos directos, agregaciones y transacciones dispersas.

---

## 10. Matriz de riesgos y controles

| Riesgo                             | Evidencia actual                            | Control requerido                                     |
| ---------------------------------- | ------------------------------------------- | ----------------------------------------------------- |
| fuga por query sin filtro          | repositorios y query builders globales      | schema por tenant o RLS + wrapper obligatorio         |
| contaminación de pool              | `search_path` dinámico                      | `SET LOCAL`, QueryRunner y reset en `finally`         |
| token válido tras suspensión       | JWT solo verifica firma                     | estado/versión de sesión y guard tenant               |
| tenant enviado por cliente         | filtros como `storeId` en DTOs              | derivar tenant del contexto y validar conflicto       |
| acceso directo al manager          | servicios usan `DataSource`/`EntityManager` | lint/revisión arquitectónica y `TenantUnitOfWork`     |
| endpoint administrativo público    | `@Public()` en seed y otras rutas           | clasificación, guards separados y eliminación en prod |
| schemas hardcodeados               | varias entidades apuntan a `public`         | migraciones y metadata tenant sin schema fijo         |
| constraints globales incorrectas   | `unique` en nombre/SKU/email                | definir unicidad por tenant o global conscientemente  |
| integración compartida             | API key global en env                       | credenciales por tenant, cifrado y rotación           |
| pérdida de datos durante migración | `synchronize: true`                         | migrations, backup, ensayo y checksums                |
| soporte cross-tenant no auditado   | no existe concepto master                   | impersonación temporal, motivo y audit event          |

---

## 11. Criterios de aceptación

La transformación no debe considerarse terminada hasta cumplir todos estos criterios:

- dos tenants activos pueden crear registros con los mismos nombres/SKU sin conflicto, si la unicidad es tenant-local;
- un usuario de A no puede consultar, modificar o borrar un UUID de B;
- una transferencia no puede usar tiendas de tenants distintos;
- los reportes nunca suman datos de otro tenant;
- dos peticiones concurrentes con schemas distintos no intercambian resultados;
- un token master no entra a endpoints tenant y un token tenant no entra a endpoints master;
- suspender un tenant bloquea nuevas peticiones y sus integraciones;
- un schema nuevo se provisiona desde cero con migraciones repetibles;
- cada migración tiene rollback o procedimiento de recuperación documentado;
- se puede restaurar/exportar un tenant de forma independiente;
- no quedan datos de negocio en `public` ni entidades tenant con schema hardcodeado;
- el build, lint, tests unitarios, integración, e2e y pruebas de concurrencia pasan;
- los logs y métricas permiten identificar tenant, usuario, request y operación sin exponer secretos.

### Suite mínima de aislamiento

Para cada módulo, crear al menos:

1. crear dato en tenant A y comprobar que aparece en A;
2. consultar desde B y comprobar `404` o `403` según la política;
3. intentar actualizar/borrar desde B y comprobar que no cambia A;
4. usar un `storeId` de A desde B;
5. ejecutar dos peticiones concurrentes A/B;
6. probar un tenant `SUSPENDED`;
7. probar ausencia de contexto tenant;
8. probar token master contra ruta tenant;
9. probar callbacks DTE con credencial de tenant incorrecta;
10. revisar que una agregación/report no cruce esquemas.

---

## 12. Decisiones que deben aprobarse antes de implementar

1. ¿El modelo definitivo será schema-per-tenant o row-level con RLS?
   R: Será row-level con RLS con el fin de que la base de datos sea quien garantice el aislamiento.
2. ¿Un usuario podrá pertenecer a varios tenants?
   R: No, un usuario pertenece a un solo tenant.
3. ¿El email será único globalmente o por tenant?
   R: Si, email único globalmente.
4. ¿Los productos son catálogo propio de cada tenant o habrá catálogo compartido de plataforma?
   R: Los productos son propio de cada tenant, nada compartido.
5. ¿DTE y credenciales tributarias serán por tenant, tienda o ambos?
   R: DTE será por ambos, un tenant puede tener varias tiendas, cada una podrá ser emisora de DTEs.
6. ¿Se permitirá soporte/impersonación cross-tenant? ¿Con qué auditoría?
   R: Solo usuarios MASTER podrán impersonar cualquier tenant, puede leer datos y modificar dejando un registro de auditoría.
7. ¿Qué endpoint o dominio se usará para resolver tenant?
   R: Con RLS no existe un endpoint para "resolver" el tenant. Cada request ya lo conoce.
8. ¿Qué plan y límites se aplicarán a almacenamiento, tiendas, usuarios?
   R: Por el momento cada tenant puede crear 5 tiendas, 5 usuarios.
9. ¿Se requiere exportación y borrado físico por obligaciones contractuales o legales?
   R: No es necesario.
10. ¿Qué tenants podrán evolucionar a una base dedicada?
    R: Sin definir por el momento

---

## 13. Orden inmediato recomendado

Antes de escribir la primera migración funcional:

1. respaldar y rotar secretos expuestos;
2. aprobar la decisión de aislamiento;
3. eliminar la dependencia de `synchronize` mediante migraciones;
4. cerrar o proteger seed y clasificar todas las rutas `@Public()`;
5. crear el catálogo master y el contrato JWT;
6. implementar y probar el contexto tenant y el wrapper de persistencia;
7. migrar un solo módulo piloto, preferentemente `stores` + `users`;
8. ejecutar la suite A/B de aislamiento;
9. continuar por cortes verticales y no hacer una sustitución masiva sin pruebas;
10. migrar los datos existentes solo después de demostrar provisioning y restauración.

La condición técnica más importante es esta: **ningún servicio tenant debe poder ejecutar una consulta sin un contexto tenant válido y sin una conexión configurada para ese tenant**. Todo el plan posterior depende de hacer cumplir esa condición de forma estructural.
