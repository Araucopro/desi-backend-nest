# Guia de trabajo para agentes en el backend ARAUCO / D3SI

Este repositorio es el backend NestJS del ERP retail ARAUCO/D3SI. Expone API HTTP para autenticacion, usuarios, tiendas, productos, inventario, precios, descuentos, ordenes de compra, transferencias, gastos, reportes, metas mensuales y DTE. Cualquier implementacion nueva debe respetar la arquitectura modular actual, mantener TypeORM como capa de persistencia y dejar las reglas de negocio definitivas en el backend.

## Stack y convenciones base

- Framework: NestJS 11.
- Servidor HTTP: Fastify con `@nestjs/platform-fastify`.
- Base de datos: PostgreSQL con TypeORM y Row-Level Security (RLS). `synchronize: false` (migraciones versionadas en `src/datasource/migrations/`).
- Configuracion: `@nestjs/config`, variables desde entorno o `.env`.
- Auth: JWT bearer con `@nestjs/jwt`.
- Validacion: `class-validator` + `class-transformer`.
- Documentacion API: Swagger en `/docs`, JSON en `/docs-json`.
- Tests: Jest.
- Formato: Prettier + ESLint.

Scripts importantes:

- `pnpm start:dev` o `npm run start:dev`: desarrollo con watch.
- `pnpm build` o `npm run build`: compilar.
- `pnpm test` o `npm test`: unit tests.
- `pnpm lint` o `npm run lint`: lint con fix.
- `pnpm format` o `npm run format`: formateo.

## Estructura actual

- `src/main.ts`: bootstrap, Fastify, CORS, pipes, interceptors, filters y Swagger.
- `src/app.module.ts`: registra todos los modulos de dominio e interceptores globales (`ResponseInterceptor`, `TenantContextInterceptor`).
- `src/datasource/database.module.ts`: conexion TypeORM/Postgres con `synchronize: false`.
- `src/multitenant`: modulo central multitenant (`TenantContextService`, `TenantContextGuard`, `TenantContextInterceptor`, `TenantSubscriber`, entidades master `Tenant`, `MasterUser`, `AuditEvent`, controladores/servicios master).
- `src/common`: interceptores, filtros, DTOs comunes, decorators y transformers.
- `src/auth`: login tenant/master, JWT, guards, decorators y payload.
- `src/users`: usuarios, roles y limites por tenant.
- `src/stores`: tiendas y limites por tenant.
- `src/relations/userstores`: relacion usuario-tienda.
- `src/products`: productos y variaciones.
- `src/relations/storeproduct`: stock/precio por tienda y variacion.
- `src/inventory`: movimientos de inventario.
- `src/pricing`: motor de precios, historial y ofertas.
- `src/purchase-orders`: ordenes de compra, estados, verificacion y aplicacion de stock.
- `src/transfers`: transferencias entre tiendas.
- `src/dte`: emision/normalizacion de documentos DTE y ventas facturadas.
- `src/reports`: reportes de ventas y estado de resultados.
- `src/expenses`: gastos.
- `src/store-monthly-targets`: metas mensuales por tienda.
- `src/categories`: categorias.

## Bootstrap global

`src/main.ts` configura reglas que todo codigo nuevo debe respetar:

- CORS con `origin: true` y `credentials: true`.
- Logging de request/response/error en hooks Fastify.
- `ValidationPipe` global con:
  - `whitelist: true`
  - `forbidNonWhitelisted: true`
  - `transform: true`
- `ResponseInterceptor` global.
- `AllExceptionsFilter` global.
- Swagger en `/docs`.

Consecuencia: cada request body/query/param nuevo debe tener DTO correcto. Si el frontend envia un campo que no esta en el DTO, la API lo rechazara.

## Formato de respuesta y errores

Todas las respuestas exitosas pasan por `ResponseInterceptor` y quedan envueltas asi:

```ts
{
  statusCode: number
  message: string
  error: null
  data: T
}
```

Los errores pasan por `AllExceptionsFilter` y conservan forma equivalente:

```ts
{
  statusCode: number
  message: string | string[]
  error: string
  data: undefined
}
```

Reglas:

- Los controllers deben devolver entidades/DTOs/datos, no armar manualmente el wrapper salvo que haya una razon clara.
- Para mensajes custom, usar el decorator existente `@ResponseMessage()` si aplica.
- Lanzar excepciones Nest (`BadRequestException`, `NotFoundException`, `UnauthorizedException`, `ForbiddenException`, etc.), no retornar `{ error: ... }`.

## Modulos Nest

Cada feature debe seguir la forma actual:

- `<dominio>.module.ts`
- `<dominio>.controller.ts`
- `<dominio>.service.ts`
- `dto/*.dto.ts`
- `entities/*.entity.ts`
- `*.service.spec.ts` cuando haya logica relevante.

Controller:

- Define rutas, decorators Swagger, pipes de parametros y DTOs.
- No contiene reglas de negocio complejas.
- Usa `ParseUUIDPipe` para ids UUID en path.

Service:

- Contiene reglas de negocio y transacciones.
- Usa repositories inyectados con `@InjectRepository`.
- Usa `DataSource` o `EntityManager` cuando haya mutaciones relacionadas.
- Lanza excepciones HTTP apropiadas.

Module:

- Importa `TypeOrmModule.forFeature([...entities])`.
- Exporta servicios solo si otro modulo los necesita.

## DTOs y validacion

Por el `ValidationPipe` global, todo DTO debe ser estricto:

- Usar `@IsString`, `@IsUUID`, `@IsEnum`, `@IsNumber`, `@IsInt`, `@IsPositive`, `@Min`, `@IsDateString`, `@IsBoolean`, etc.
- En arrays anidados usar `@IsArray`, `@ValidateNested({ each: true })`, `@Type(() => ChildDto)`.
- En query params numericos usar `@Type(() => Number)`.
- Documentar con `@ApiProperty` o `@ApiPropertyOptional`.
- Para updates, usar `PartialType(CreateDto)` solo si todos los campos pueden ser opcionales sin romper reglas.
- No aceptar campos ambiguos que el frontend "tal vez use"; si no existe contrato, definirlo primero.

## Autenticacion y autorizacion

Auth actual:

- `POST /auth/login` es publico para usuarios de tenant y devuelve `user` + `accessToken`.
- `POST /master/login` es publico para administradores de plataforma (MASTER).
- `GET /auth/check-status` usa `AuthGuard`.
- JWT payload Tenant: `{ id, email, role, tenantID }`.
- JWT payload Master: `{ id, email, isMasterAdmin: true }`.
- El `tenantID` se obtiene del JWT: `tenantId` en tokens tenant y `impersonatingTenantId` en tokens master con impersonación. No se usa el header `X-Tenant-ID`.
- Roles actuales en `UserRole`:
  - `admin`
  - `store_manager`
  - `consignado`
  - `tercero`
- Decorators principales:
  - `@Public()` marca rutas publicas.
  - `@Roles(...roles)` define roles de tenant requeridos.
  - `@MasterRoute()` marca rutas de plataforma MASTER.
- Guards:
  - `AuthGuard` valida el token Bearer.
  - `TenantContextGuard` valida que el token tenga contexto tenant (`tenantId` o `impersonatingTenantId`) y que el tenant esté activo.
  - `MasterAuthGuard` valida autenticacion master.
  - `RolesGuard` valida roles cuando se usa.

Reglas para endpoints nuevos:

- No confiar en validaciones del frontend para permisos.
- Si un endpoint lee o muta datos sensibles de tenant, proteger con `@UseGuards(AuthGuard)` y la infraestructura de context tenant.
- Si es un endpoint administrativo de plataforma/provisioning, usar `@UseGuards(MasterAuthGuard)` + `@MasterRoute()`.
- Validar alcance por tienda en backend cuando el usuario no sea admin. El filtro de UI no es seguridad.
- Usar `@GetUser()` para obtener datos del JWT si la accion depende del usuario.
- Si se crea una ruta publica, debe estar justificada y marcada explicitamente con `@Public()`.

Nota importante: Swagger muestra bearer global, pero eso no significa que todos los endpoints esten protegidos automaticamente. La proteccion real depende de guards/decorators.

## Base de datos y entidades

El proyecto usa TypeORM con `synchronize: false`. **Queda estrictamente prohibido activar `synchronize: true`**. Todos los cambios de modelo deben aplicarse mediante migraciones versionadas en `src/datasource/migrations/`.

Reglas:

- Todas las entidades comerciales de negocio deben incluir `tenantID!: string;`.
- Mantener nombres de columnas clave: `userID`, `storeID`, `productID`, `variationID`, `storeProductID`, `purchaseOrderID`, `dteDocumentID`, `tenantID`.
- Las tablas comerciales cuentan con indices compuestos `(tenantID, pk)` para asegurar un filtrado eficiente y seguro junto a RLS.
- Usar `ColumnNumericTransformer` para columnas `decimal` que deben llegar como `number`.
- Definir relaciones con `@ManyToOne`, `@OneToMany`, `@OneToOne`, `@JoinColumn` siguiendo entidades cercanas.
- Para operaciones que cambian varias tablas o mutan datos de negocio, envolver en la infraestructura de transaccion multitenant (`TenantContextService`).

## Arquitectura Multitenant y Row-Level Security (RLS)

El aislamiento entre tenants se garantiza en la capa de base de datos PostgreSQL mediante **Row-Level Security (RLS)** asistido por el runtime NestJS.

### Funcionamiento de RLS

- El usuario de base de datos en runtime (`app_runtime`) no tiene privilegios `BYPASSRLS`. RLS esta activado y forzado en todas las tablas de negocio (`FORCE ROW LEVEL SECURITY`).
- Las tablas master (`tenants`, `master_users`, `audit_events`) son de administracion global y tienen RLS desactivado.
- Cada query sobre tablas comerciales exige que la variable de sesion PostgreSQL `app.tenant_id` este establecida. Si no esta establecida o no coincide, PostgreSQL no devolvera filas (0 resultados).

### Patron de ejecucion en Servicios (`TenantContextService`)

Todo servicio de negocio debe inyectar `TenantContextService` opcionalmente y envolver sus consultas/transacciones:

```ts
@Injectable()
export class MiDominioService {
  constructor(
    @InjectRepository(MiEntidad) private readonly repo: Repository<MiEntidad>,
    @Optional() private readonly tenantContext?: TenantContextService,
  ) {}

  private runInTransaction<T>(cb: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.tenantContext
      ? this.tenantContext.transaction(cb)   // Ejecuta SELECT set_config('app.tenant_id', tenantId, true) dentro de la transaccion
      : this.repo.manager.transaction(cb);   // Fallback para tests unitarios/seed sin contexto tenant
  }
}
```

### Reglas clave de Multitenant:

1. **Auto-inyeccion de `tenantID`**: `TenantSubscriber` asigna automaticamente `tenantID` en operaciones `save`/`insert` cuando la peticion se ejecuta dentro del contexto tenant.
2. **Limites por Tenant**:
   - Maximo 5 tiendas por tenant (`maxStores`).
   - Maximo 5 usuarios por tenant (`maxUsers`).
   - Al crear tiendas o usuarios, el servicio debe bloquear de forma pesimista el registro de `Tenant` (`lock: { mode: 'pessimistic_write' }`) y validar los conteos actuales antes de guardar.
3. **No realizar queries directas a `DataSource.manager` sin contexto tenant**: Siempre preferir el wrapper `tenantContext.transaction(...)`.

## Reglas de negocio sensibles

### Inventario

- `InventoryMovements` debe ser la fuente de verdad logica del movimiento de stock.
- `StoreProduct.stock` existe como cache/read model para lectura rapida y compatibilidad. No tratarlo como historial.
- Crear entradas/salidas con `InventoryService.createMovement()` cuando el dominio sea movimiento de inventario.
- Razones actuales:
  - `SALE`
  - `PURCHASE`
  - `ADJUSTMENT`
  - `TRANSFER_IN`
  - `TRANSFER_OUT`
- Para `SALE` y `TRANSFER_OUT`, el delta debe ser negativo.
- Para `PURCHASE` y `TRANSFER_IN`, el delta debe ser positivo.
- Para `ADJUSTMENT`, calcular delta desde `newStock - currentStock`.
- Si una operacion toca stock de varias filas, usar transaccion y locks si hay riesgo de concurrencia.

### StoreProduct

`StoreProduct` une tienda + variacion:

- `stock`
- `priceCost`
- `priceList`
- ofertas activas via `SpecialOffer`

Existe indice unico por `variation` + `store`. No crear duplicados. Para crear/actualizar usar upsert logico dentro de transaccion.

### Productos

- `Product` tiene `variations`.
- `ProductVariation.sku` es unico.
- Al crear producto, el servicio busca tienda central (`isCentralStore: true`) y crea `StoreProduct` inicial con stock/precios de cada variacion.
- El frontend consume a menudo `variations`, `storeProducts` y `store`; si cambias relaciones, coordina normalizadores del frontend.

### Precios y descuentos

- `PricingService` es el motor central de precios.
- `OfferService` decide ofertas activas y mejor oferta.
- No duplicar calculo de precio final en otros servicios si puede llamarse `calculatePrice`.
- Respetar validadores:
  - `MarginValidator`
  - `UserDiscountValidator`
- `calculatePrice` devuelve `basePrice`, `finalPrice`, `breakdown`, `discountApplied`, `discountsApplied`, `discountDetails`, `pricingContext`.
- Si una nueva venta/cotizacion/descuento necesita precio final, debe pasar por este motor o justificar excepcion.

### Ordenes de compra

- `PurchaseOrdersService` calcula totales con IVA `TAX_RATE = 0.19`.
- Estados comerciales tienen transiciones controladas:
  - `Pendiente -> Enviado | Rechazado`
  - `Enviado -> Aceptado | Rechazado`
  - `Aceptado` y `Rechazado` son finales.
- Al cambiar `paymentStatus` a `Pagado`, se aplica stock.
- Al volver desde `Pagado` a `Pendiente` o `Anulado`, se revierte stock.
- Verificacion no permite reducir cantidad ya recibida.
- Folios se generan backend-side.

### Transferencias

- Una transferencia no puede tener misma tienda origen y destino.
- Solo se agregan items a transferencias `PENDING`.
- Completar transferencia crea movimientos `TRANSFER_OUT` y `TRANSFER_IN` y marca `COMPLETED`.
- Mantener `referenceID` para trazabilidad.

### DTE y ventas

- No existe un modulo `sales` clasico en la estructura actual.
- Las ventas/reportes actuales se apoyan en `DteDocument` con status `EMITIDO`.
- `POST /v2/dte/document` es publico por compatibilidad con facturador/Openfactura y usa `Idempotency-Key`.
- `DteService.create()`:
  - valida `OPENFACTURA_APIKEY`;
  - evita duplicados por `idempotencyKey` o `purchaseOrderID`;
  - resuelve tienda por RUT emisor;
  - resuelve variaciones por SKU o nombre;
  - valida OC asociada si existe;
  - envia a Openfactura;
  - guarda `DteDocument`;
  - aplica movimientos de inventario `SALE`.
- Si el frontend requiere endpoint tipo `/sales`, no crear logica paralela sin definir contrato. Evaluar si debe mapear a DTE, crear modulo sales real o mantener compatibilidad temporal.

### Reportes

- `ReportsService` consulta principalmente `DteDocument`, `PurchaseOrder` y `Expense`.
- `income-statement` agrega por ano/mes.
- `sales` agrupa documentos por pago/estado y pagina documentos.
- Los reportes contables deben calcularse backend-side, no en frontend si son fuente de decision.

## Contratos con frontend

El frontend actual espera:

- Respuestas envueltas en `{ statusCode, message, error, data }`.
- IDs con sufijo `ID`.
- Fechas ISO.
- Errores con `message` legible.
- Productos con relaciones de variaciones, store products, tienda y categoria.
- Precios calculados como `finalPrice`, `discountApplied`, `activeOffer` cuando se incluyen en lecturas de inventario/productos.

Al agregar endpoint:

1. Definir DTO request.
2. Definir entidad o DTO response.
3. Agregar Swagger (`@ApiTags`, `@ApiOperation`, `@ApiResponse`, `@ApiQuery`, `@ApiParam`).
4. Implementar service con transacciones si corresponde.
5. Confirmar que el frontend pueda consumirlo con `fetcher`, que unwrappea `data`.
6. Si se cambia forma de respuesta, coordinar normalizadores del frontend.

Formato recomendado:

```ts
@ApiTags('Dominio')
@Controller('resource')
export class ResourceController {
  constructor(private readonly service: ResourceService) {}

  @Post()
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Crear recurso' })
  create(@Body() dto: CreateResourceDto) {
    return this.service.create(dto);
  }
}
```

## Transacciones y concurrencia

Usar `dataSource.transaction()` o `entityManager.transaction()` cuando:

- Se crea/actualiza mas de una entidad relacionada.
- Se toca stock.
- Se toca dinero/totales.
- Se cambia estado con efectos secundarios.
- Se necesita idempotencia.

Usar `lock: { mode: 'pessimistic_write' }` en lecturas que preceden cambios de stock/estado para evitar carreras.

No hacer mutaciones parciales fuera de transaccion cuando una falla dejaria datos inconsistentes.

## Integraciones externas

Openfactura:

- Variables:
  - `OPENFACTURA_APIKEY`
  - `OPENFACTURA_BASE_URL` opcional, default `https://dev-api.haulmer.com`
- No loggear secretos completos. El codigo actual solo muestra preview parcial de API key.
- Usar idempotencia cuando el proveedor o flujo pueda reintentar.
- Si falla proveedor externo, lanzar excepcion HTTP clara y no persistir estado incompleto salvo que el flujo lo disene explicitamente.

## Configuracion y entorno

Variables relevantes:

- `DATABASE_URL` o `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`.
- `JWT_SECRET`.
- `PORT`, default `3001`.
- `OPENFACTURA_APIKEY`.
- `OPENFACTURA_BASE_URL`.

No hardcodear secretos ni URLs productivas nuevas.

## Estilo de codigo

- Mantener TypeScript estricto.
- Usar ingles o espanol de forma consistente con archivo cercano; no mezclar innecesariamente.
- Preferir nombres de dominio existentes sobre abstracciones nuevas.
- Evitar `any` nuevo salvo en bordes legacy o payloads externos; encapsularlo y normalizar pronto.
- Servicios no deben depender de detalles de UI.
- Controllers no deben contener query builders complejos.
- No introducir nuevas librerias si Nest/TypeORM/class-validator ya resuelven el caso.

## Checklist para implementar una feature

- Lei modulo, entidad, DTO y servicio cercanos.
- Verifique que la entidad incluya `tenantID!: string;` si pertenece al dominio de negocio.
- Inyecte `@Optional() private readonly tenantContext?: TenantContextService` en el servicio y use `tenantContext.transaction(...)` para mutaciones/queries.
- Respete los limites por tenant (`maxStores`, `maxUsers`) usando bloqueo pesimista cuando corresponda.
- Revise impacto en frontend y nombres esperados por contratos actuales.
- Cree/actualice DTOs con validadores y Swagger.
- Agregue guards/roles si el endpoint no debe ser publico (`AuthGuard`, `TenantContextGuard`, o `MasterAuthGuard` con `@MasterRoute()`).
- Use `InventoryService` o movimientos para cambios de stock.
- Use `PricingService` para precio final/descuentos.
- Lance excepciones Nest, no respuestas manuales de error.
- Mantuve respuesta compatible con interceptor global.
- Corri `pnpm exec tsc --noEmit` para verificar la ausencia de errores TypeScript.
- Agregue o actualice tests si la logica es sensible.
