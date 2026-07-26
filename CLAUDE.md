# Guia de trabajo para Claude en el backend ARAUCO / D3SI

Claude debe leer y seguir estas reglas al trabajar en este repositorio. La idea es que cualquier dev pueda pedir una implementacion nueva sin repetir todo el contexto de arquitectura.

## Contexto rapido

Backend NestJS 11 con Fastify, TypeORM/PostgreSQL, JWT, Swagger, DTOs con `class-validator`, interceptor global de respuesta y filtro global de errores.

Dominios principales:

- Auth/JWT.
- Usuarios, roles y tiendas.
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

- `POST /auth/login` publico.
- `GET /auth/check-status` con `AuthGuard`.
- JWT payload: `{ id, email, role }`.
- Decorators:
  - `@Public()`
  - `@Roles(...)`
  - `@GetUser()`
- Guards:
  - `AuthGuard`
  - `RolesGuard`

Roles:

- `admin`
- `store_manager`
- `consignado`
- `tercero`

Para endpoints sensibles:

```ts
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
```

Swagger con bearer global no protege rutas por si solo. La proteccion real debe estar en guards.

## Persistencia TypeORM

Base de datos PostgreSQL. TypeORM esta con `synchronize: true`, asi que los cambios de entidades pueden tocar la DB automaticamente.

Reglas:

- No renombrar columnas/tablas sin plan.
- Mantener IDs existentes con sufijo `ID`.
- Usar `ColumnNumericTransformer` para `decimal` que deba llegar como `number`.
- Usar relaciones e indices como en entidades cercanas.
- Usar transacciones para mutaciones de varias tablas.

Entidades clave:

- `User` con `UserRole`.
- `Store` con `StoreType` e `isCentralStore`.
- `Product` y `ProductVariation`.
- `StoreProduct`: tienda + variacion, stock/cache y precios.
- `InventoryMovement`: historial logico de movimientos.
- `SpecialOffer` y `PriceHistory`.
- `PurchaseOrder` y `PurchaseOrderItem`.
- `StoreTransfer` y `StoreTransferItem`.
- `DteDocument`.

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
- Defini DTOs estrictos y Swagger.
- Use guards/roles si no es publico.
- Use service para reglas de negocio.
- Use TypeORM repositories y transacciones donde corresponde.
- Use `InventoryService` para movimientos de stock.
- Use `PricingService` para precios/descuentos.
- Lance excepciones Nest.
- Respete wrapper global de respuesta.
- Mantengo contratos compatibles con frontend.
- Agregue tests para logica sensible.
- Corri build/test aplicable o explique por que no.

