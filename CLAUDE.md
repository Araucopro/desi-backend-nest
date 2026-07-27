# Guia de trabajo para Claude en el backend ARAUCO / D3SI

Claude debe leer y seguir estas reglas al trabajar en este repositorio. La idea es que cualquier dev pueda pedir una implementacion nueva sin repetir todo el contexto de arquitectura.

## Contexto rapido

Backend NestJS 11 con Fastify, TypeORM/PostgreSQL con Row-Level Security (RLS), `synchronize: false` (migraciones versionadas), JWT, Swagger, DTOs con `class-validator`, interceptor global de respuesta, interceptor de contexto multitenant y filtro global de errores.

Dominios principales:

- Multitenant (`src/multitenant`): RLS, contexto `AsyncLocalStorage`, entidades master (`Tenant`, `MasterUser`, `AuditEvent`), guards/interceptors tenant y API master.
- Auth/JWT (Tenant y Master).
- Usuarios, roles y tiendas (con limites por tenant: 5 usuarios, 5 tiendas).
- Productos, variaciones y stock por tienda.
- Inventario por movimientos.
- Precios, historial y ofertas.
- Ordenes de compra.
- Transferencias.
- DTE y documentos emitidos.
- Reportes, gastos y metas mensuales.

## Regla principal

El backend es la fuente de verdad. No delegar al frontend:

- permisos por rol/tienda;
- stock real;
- precios finales;
- descuentos vigentes;
- totales, IVA, folios;
- estados comerciales o de pago;
- anulaciones, transferencias o movimientos persistentes.

El frontend puede validar para UX, pero este backend debe revalidar todo lo que afecte datos reales.

## Respuesta API

No envolver manualmente respuestas normales. El interceptor global genera:

```ts
{
  statusCode: 200,
  message: 'Operacion exitosa',
  error: null,
  data: result
}
```

Los errores deben lanzarse con excepciones Nest:

```ts
throw new BadRequestException('Mensaje claro')
throw new NotFoundException('Recurso no encontrado')
throw new ForbiddenException('Sin permisos')
```

El filtro global convierte errores a:

```ts
{
  statusCode: number,
  message: string | string[],
  error: string,
  data: undefined
}
```

## Validacion estricta

`ValidationPipe` global esta configurado con:

- `whitelist: true`
- `forbidNonWhitelisted: true`
- `transform: true`

Por eso cada endpoint nuevo necesita DTOs completos. Si un campo no esta declarado en el DTO, se rechaza.

Usar:

- `@IsUUID()` para IDs.
- `@IsEnum()` para enums.
- `@IsNumber()`, `@IsInt()`, `@IsPositive()`, `@Min()` para numeros.
- `@IsDateString()` para fechas de entrada.
- `@ValidateNested({ each: true })` + `@Type(() => Dto)` para arrays anidados.
- `@ApiProperty` / `@ApiPropertyOptional` para Swagger.

## Estructura por feature

Seguir este patron:

- `src/<dominio>/<dominio>.module.ts`
- `src/<dominio>/<dominio>.controller.ts`
- `src/<dominio>/<dominio>.service.ts`
- `src/<dominio>/dto/*.dto.ts`
- `src/<dominio>/entities/*.entity.ts`
- tests `*.spec.ts` si la logica tiene riesgo.

Controllers:

- Solo rutas, DTOs, guards, pipes y Swagger.
- Usar `ParseUUIDPipe` en params UUID.

Services:

- Reglas de negocio.
- Repositories TypeORM.
- Transacciones.
- Excepciones Nest.

Modules:

- `TypeOrmModule.forFeature([...])`.
- Exportar servicios solo si otro modulo los necesita.

## Auth y roles

Auth actual:

- `POST /auth/login` publico para usuarios de tenant.
- `POST /master/login` publico para usuarios de plataforma (MASTER).
- `GET /auth/check-status` con `AuthGuard`.
- JWT payload Tenant: `{ id, email, role, tenantID }`.
- JWT payload Master: `{ id, email, isMasterAdmin: true }`.
- Header obligatorio para peticiones de tenant: `X-Tenant-ID` (debe coincidir con `tenantID` del JWT).
- Decorators:
  - `@Public()`
  - `@Roles(...)`
  - `@GetUser()`
  - `@MasterRoute()`
- Guards:
  - `AuthGuard`
  - `TenantContextGuard`
  - `MasterAuthGuard`
  - `RolesGuard`

Roles:

- `admin`
- `store_manager`
- `consignado`
- `tercero`

Para endpoints sensibles de tenant:

```ts
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
```

Para endpoints de plataforma/master (o seed):

```ts
@UseGuards(MasterAuthGuard)
@MasterRoute()
```

Swagger con bearer global no protege rutas por si solo. La proteccion real debe estar en guards.

## Persistencia TypeORM

Base de datos PostgreSQL. TypeORM esta con `synchronize: false`. **Queda prohibido usar `synchronize: true`**. Todos los cambios de entidad deben crearse via migraciones TypeORM en `src/datasource/migrations/`.

Reglas:

- Todas las entidades de negocio deben incluir `tenantID!: string;`.
- No renombrar columnas/tablas sin plan.
- Mantener IDs existentes con sufijo `ID` y `tenantID`.
- Usar `ColumnNumericTransformer` para `decimal` que deba llegar como `number`.
- Usar relaciones e indices compuestos `(tenantID, pk)` como en entidades cercanas.
- Usar transacciones envueltas en `TenantContextService` para mutaciones de negocio.

Entidades clave:

- `Tenant` (master), `MasterUser` (master), `AuditEvent` (master).
- `User` con `UserRole` y `tenantID`.
- `Store` con `StoreType`, `isCentralStore` y `tenantID`.
- `Product` y `ProductVariation` con `tenantID`.
- `StoreProduct`: tienda + variacion, stock/cache, precios y `tenantID`.
- `InventoryMovement`: historial logico de movimientos y `tenantID`.
- `SpecialOffer` y `PriceHistory` con `tenantID`.
- `PurchaseOrder` y `PurchaseOrderItem` con `tenantID`.
- `StoreTransfer` y `StoreTransferItem` con `tenantID`.
- `DteDocument` con `tenantID`.

## Multitenant y Row-Level Security (RLS)

El aislamiento entre organizaciones se realiza via PostgreSQL RLS con la variable de sesion `app.tenant_id`:

- `TenantContextService.transaction(callback)` ejecuta `SELECT set_config('app.tenant_id', tenantId, true)` dentro de la conexion transaccional.
- `TenantSubscriber` auto-asigna `tenantID` en operaciones `save` si existe contexto de tenant.
- En la creacion de tiendas y usuarios, se aplican limites por tenant (`maxStores`: 5, `maxUsers`: 5) mediante transacciones con bloqueo pesimista en la entidad `Tenant`.
- Nunca ejecutar queries directas a `DataSource.manager` sin pasar por el contexto tenant.

## Inventario

Regla central: `InventoryMovements` es la verdad logica de movimientos. `StoreProduct.stock` es cache/read model.

Usar `InventoryService.createMovement()` cuando el caso sea movimiento de stock.

Razones:

- `SALE`
- `PURCHASE`
- `ADJUSTMENT`
- `TRANSFER_IN`
- `TRANSFER_OUT`

No cambiar stock sin pensar en trazabilidad. Si por compatibilidad se actualiza `StoreProduct.stock`, debe quedar consistente con movimientos o estar muy justificado.

## Precios y descuentos

Usar `PricingService` para precio final:

- calcula precio base;
- aplica mejor oferta activa;
- aplica descuento manual si corresponde;
- valida margen;
- devuelve breakdown.

Usar `OfferService` para crear/listar/actualizar ofertas y elegir mejor oferta.

No duplicar calculos de descuento en servicios nuevos si se puede delegar al motor de precios.

## Ordenes de compra

`PurchaseOrdersService`:

- calcula subtotal/neto/IVA/total con `TAX_RATE = 0.19`;
- genera folio en backend;
- controla transiciones comerciales;
- aplica/revierte stock al cambiar estado de pago;
- verifica recepcion y no permite reducir cantidad ya recibida.

Transiciones comerciales actuales:

- `Pendiente -> Enviado | Rechazado`
- `Enviado -> Aceptado | Rechazado`
- finales: `Aceptado`, `Rechazado`

## DTE y ventas

No hay modulo `sales` clasico en este repo. Las ventas/reportes actuales se apoyan en `DteDocument` con estado `EMITIDO`.

`POST /v2/dte/document`:

- es publico por compatibilidad;
- recibe `Idempotency-Key`;
- resuelve tienda por RUT;
- resuelve variaciones por SKU o nombre;
- valida OC si viene `purchaseOrderID`;
- llama Openfactura;
- guarda documento;
- descuenta stock con movimiento `SALE`.

Si el frontend pide `/sales`, no crear una solucion paralela sin decidir contrato: puede ser adaptador a DTE, modulo sales real, o endpoint de compatibilidad.

## Reportes

`ReportsService` agrega desde:

- `DteDocument` para ventas/documentos emitidos;
- `PurchaseOrder` para ingresos de OC pagadas;
- `Expense` para egresos.

Reportes contables o indicadores oficiales deben calcularse en backend.

## Contrato con frontend

El frontend espera:

- wrapper `{ statusCode, message, error, data }`;
- IDs como `storeID`, `productID`, `variationID`, `storeProductID`, etc.;
- fechas ISO;
- mensajes de error claros;
- productos con `variations`, `storeProducts`, `store`, `category`;
- precios con `finalPrice`, `discountApplied`, `activeOffer` cuando aplica.

Antes de cambiar respuesta, revisar frontend o documentar cambio para normalizadores.

## Transacciones

Usar transaccion cuando:

- se toca stock;
- se toca dinero/totales;
- se crean varias entidades relacionadas;
- se cambia estado con efectos secundarios;
- se llama flujo idempotente;
- una falla parcial dejaria inconsistencia.

Usar `lock: { mode: 'pessimistic_write' }` en filas de stock/estado que se modifican bajo concurrencia.

## Integraciones externas

Openfactura usa:

- `OPENFACTURA_APIKEY`
- `OPENFACTURA_BASE_URL`

No loggear secretos completos. Mantener idempotencia en flujos reintentables.

## Checklist de implementacion

- Lei modulo/servicio/DTO/entidad cercanos.
- Inclui `tenantID!: string;` en las entidades de negocio.
- Inyecte `@Optional() private readonly tenantContext?: TenantContextService` en el servicio y use `tenantContext.transaction(...)`.
- Valide limites por tenant (`maxStores`, `maxUsers`) en creaciones si aplica.
- Defini DTOs estrictos y Swagger.
- Use guards/roles correspondientes (`AuthGuard`, `TenantContextGuard`, o `MasterAuthGuard` + `@MasterRoute()`).
- Use service para reglas de negocio.
- Use `InventoryService` para movimientos de stock.
- Use `PricingService` para precios/descuentos.
- Lance excepciones Nest.
- Respete wrapper global de respuesta.
- Mantengo contratos compatibles con frontend.
- Verifique la compilacion sin errores con `pnpm exec tsc --noEmit`.
- Agregue tests para logica sensible.
