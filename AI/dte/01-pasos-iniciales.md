# Integración DTE (Boleta 39 y Factura 33) con Openfactura / SII Chile
## Documento 01: Pasos Iniciales y Cohesión Arquitectónica

Este documento define el diagnóstico original del módulo DTE (`src/dte/`), los cambios ya aplicados y la hoja de ruta hacia la integración comercial completa con el SII mediante Openfactura.

---

## 1. Diagnóstico del Estado Inicial (`src/dte/`)

El módulo `src/dte/` fue concebido como una prueba de concepto preliminar para interactuar con la API de Openfactura (`https://dev-api.haulmer.com`).

### Componentes Existentes al Inicio:
* **Entidad `DteDocument`** (`src/dte/entities/dte-document.entity.ts`):
  * Almacena datos básicos (`dteDocumentID`, `tenantID`, `storeID`, `purchaseOrderID`, `folio`, `token`, `status`, `documentType`, `paymentType`, `total`, `payloadRaw`, `payloadNormalized`).
  * Posee campo `tenantID` e índices compuestos `(storeID, createdAt)`.
* **Servicio `DteService`** (`src/dte/dte.service.ts`):
  * Recibía un JSON completo con formato Openfactura (`CreateDteDocumentDto`).
  * Resolvía la tienda buscando por `RUTEmisor` en el payload — sin autenticación.
  * Resolvía variaciones por coincidencia de nombre (`ILike(NmbItem)`) o SKU opcional.
  * Ejecutaba la llamada a Openfactura dentro de la misma transacción de DB.
  * Descontaba inventario registrando movimientos de tipo `SALE`.
* **Controlador `DteController`** (`src/dte/dte.controller.ts`):
  * Exponía `POST /v2/dte/document` marcado con `@Public()`.

---

## 2. Inconsistencias Identificadas y Estado de Resolución

### 2.1. Seguridad y Contexto de Tienda Activa — ✅ RESUELTO
* **Problema original**: El endpoint era `@Public()`. Cualquier cliente podía emitir DTEs indicando cualquier RUT de tienda. Un mismo usuario puede gestionar múltiples tiendas (relación `UserStore`), y el JWT no puede asumir una tienda fija.
* **Solución implementada**:
  * Constante `STORE_ID_HEADER = 'x-store-id'` en `src/multitenant/multitenant.constants.ts`.
  * Guard `StoreContextGuard` (`src/common/guards/store-context.guard.ts`): extrae `X-Store-ID` del header, valida que el usuario pertenezca a esa tienda en `UserStore`. Rol `admin` bypassa la verificación de asignación.
  * Decorador `@GetStoreId()` (`src/common/decorators/get-store-id.decorator.ts`): extrae el `storeID` activo de la petición en controllers.
  * Endpoint `GET /userstores/my-stores` (protegido con `AuthGuard`) para que el frontend descubra las tiendas accesibles del usuario y permita al usuario seleccionar la tienda activa.
  * `StoreContextGuard` y el repositorio `UserStore` exportados desde `UserstoresModule` e importados en `DteModule`.

### 2.2. Atributos de Emisor en Tienda (datos SII) — ✅ RESUELTO
* **Problema original**: La entidad `Store` no tenía campos para construir el objeto `Emisor` del DTE (giro, código de actividad, código SII de sucursal, razón social).
* **Solución implementada**:
  * Nuevas columnas `nullable` en `Store`: `giro`, `acteco`, `cdgSIISucur`, `businessName`.
  * `CreateStoreDto` actualizado con los campos opcionales correspondientes.
  * Migración `20260728000500-add-dte-store-fields-and-supplier-sku.ts` ejecutada.

### 2.3. SKU de Proveedor en Variaciones — ✅ RESUELTO (preparación futura)
* **Problema original**: `ProductVariation` solo tenía `sku` interno. Para recepcionar facturas de proveedores y mapear sus productos al catálogo interno se necesita el código del proveedor.
* **Solución implementada**:
  * Nueva columna `nullable` `supplierSku` en `ProductVariations`.
  * `CreateProductVariationDto` actualizado con el campo opcional.
  * Incluida en la migración `20260728000500`.

### 2.4. Brecha de Negocio: Boleta (39) vs Factura (33) — ⏳ PENDIENTE
* **Boleta Electrónica (DTE 39)**: Consumidor final, receptor anónimo (`66666666-6`), precios con IVA incluido.
* **Factura Electrónica (DTE 33)**: Exige datos completos y válidos del Receptor (RUT con DV, Razón Social, Giro, Dirección, Comuna) y desglose obligatorio de Neto + IVA (19%).
* **Pendiente**: Crear un DTO de venta de dominio (`EmitDteDto`) separado del DTO técnico de Openfactura, con validación diferenciada por tipo de documento.

### 2.5. Resolución de Productos por variationID — ⏳ PENDIENTE
* **Problema original**: `DteService.resolveVariation` buscaba por nombre de texto (`ILike`), propenso a errores.
* **Pendiente**: El nuevo flujo de venta debe recibir `variationID` (UUID) directamente desde el POS/frontend.

### 2.6. Integración con Motor de Precios — ⏳ PENDIENTE
* **Problema original**: El servicio confiaba en los montos del payload externo sin verificar contra `PricingService`.
* **Pendiente**: Invocar `PricingService.calculatePrice()` para validar y calcular el precio final antes de construir el payload DTE.

### 2.7. Concurrencia: Llamada HTTP dentro de Transacción DB — ⏳ PENDIENTE
* **Problema original**: La llamada `fetch` a Openfactura ocurre dentro de la transacción PostgreSQL, reteniendo locks por el tiempo de respuesta de la API externa.
* **Pendiente**: Separar el flujo en dos transacciones: (1) reserva de stock y creación del DTE en estado `PENDIENTE`, (2) actualización post-respuesta de Openfactura.

---

## 3. Hoja de Ruta — Próximos Pasos

### Paso 1 (próximo): DTO de Venta de Dominio (`EmitDteDto`)
Crear `src/dte/dto/emit-dte.dto.ts` orientado al POS/frontend, separado del DTO técnico de Openfactura:

* `documentType`: `39` (Boleta) | `33` (Factura). Determina qué validaciones aplican.
* `storeID`: UUID de la tienda activa (será verificado por `StoreContextGuard` vía `X-Store-ID`).
* `paymentType`: `Efectivo` | `Debito` | `Credito` | `Transferencia`.
* `items`: Array de `{ variationID: string, quantity: number }`. Sin precios — los calcula el backend.
* `receptor` (requerido **solo** si `documentType === 33`):
  * `rut`: string con dígito verificador válido (módulo 11).
  * `razonSocial`: string.
  * `giro`: string.
  * `direccion`: string.
  * `comuna`: string.
* `customerEmail` (opcional): para envío del DTE por correo al cliente.

### Paso 2: Validador de RUT Chileno
Crear `src/common/validators/is-rut.validator.ts` como decorador `class-validator` personalizado que:
* Verifica el formato `12345678-K` (dígitos, guión, dígito/K).
* Calcula el dígito verificador con módulo 11 y rechaza si no coincide.
* Aplicar al campo `receptor.rut` en `EmitDteDto`.

### Paso 3: Servicio de Mapeo a Openfactura (`DteMapperService`)
Crear `src/dte/dte-mapper.service.ts` que tome la `Store`, las variaciones resueltas, los totales calculados y el `EmitDteDto`, y construya el payload exacto que exige la API de Openfactura:
* **Emisor**: `store.rut`, `store.businessName ?? store.name`, `store.giro`, `store.address`, `store.location`, `store.acteco`, `store.cdgSIISucur`.
* **Receptor**:
  * Boleta 39: `RUTRecep = '66666666-6'`, `RznSocRecep = 'CONSUMIDOR FINAL'`.
  * Factura 33: datos validados del objeto `receptor` del DTO.
* **Totales y desglose IVA**:
  * Boleta 39: `MntTotal = total` (precio con IVA incluido).
  * Factura 33: `MntNeto = Math.round(total / 1.19)`, `IVA = total - MntNeto`, `TasaIVA = '19'`.

### Paso 4: Refactor del Flujo Transaccional
Crear método `DteService.emitSaleDte(storeID: string, tenantID: string, dto: EmitDteDto)`:
1. **Transacción 1 — Reserva**:
   * Lock pesimista en `StoreProduct` para cada `variationID`.
   * Verificar stock suficiente.
   * Calcular precios con `PricingService.calculatePrice()`.
   * Crear `DteDocument` en estado `PENDIENTE`.
   * Commit transacción 1 (libera los locks).
2. **Fuera de transacción** — Llamada HTTP a Openfactura con el payload construido por `DteMapperService`.
3. **Transacción 2 — Cierre**:
   * Si respuesta OK: actualizar `DteDocument` a `EMITIDO` con `folio`, `token`; insertar movimientos `SALE` en `InventoryMovement`; decrementar `StoreProduct.stock`.
   * Si respuesta error: actualizar `DteDocument` a `ERROR`; **no** descontar stock; lanzar excepción HTTP.

### Paso 5: Controlador Protegido de Ventas (`POST /v2/dte/emit`)
Agregar en `src/dte/dte.controller.ts`:
```ts
@Post('emit')
@UseGuards(AuthGuard, TenantContextGuard, StoreContextGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.STORE_MANAGER)
@ApiHeader({ name: 'X-Store-ID', required: true, description: 'UUID de la tienda activa' })
emitSale(
  @GetUser() user: JwtPayload,
  @GetStoreId() storeID: string,
  @Body() dto: EmitDteDto,
) {
  return this.dteService.emitSaleDte(storeID, user.tenantId, dto);
}
```
Mantener `POST /v2/dte/document` solo para compatibilidad con webhooks externos de Openfactura.

---

## 4. Flujo de Selección de Tienda (ya implementado)

```
1. POST /auth/login                → JWT (userId, tenantId, role) — sin storeID
2. GET  /userstores/my-stores      → lista de tiendas asignadas al usuario
   Authorization: Bearer <token>
3. <usuario selecciona tienda en UI>
4. Todas las peticiones operativas incluyen:
   Authorization: Bearer <token>
   X-Store-ID:  <storeID-seleccionado>
```

`StoreContextGuard` verifica en `UserStore` que el par `(userID, storeID)` exista. El rol `admin` bypassa esa verificación y tiene acceso a todas las tiendas del tenant.

---

## 5. Criterios de Aceptación

| # | Criterio | Estado |
|---|---|---|
| 1 | `pnpm exec tsc --noEmit` sin errores | ✅ |
| 2 | `GET /userstores/my-stores` devuelve tiendas del usuario autenticado | ✅ |
| 3 | `StoreContextGuard` rechaza `403` sin `X-Store-ID` | ✅ |
| 4 | `StoreContextGuard` rechaza `403` si el usuario no pertenece a la tienda | ✅ |
| 5 | Campos DTE en `Store` persisten correctamente | ✅ |
| 6 | `supplierSku` persiste en `ProductVariation` | ✅ |
| 7 | Boleta (39) se emite sin datos de receptor | ⏳ |
| 8 | Factura (33) rechaza si falta receptor o RUT inválido | ⏳ |
| 9 | Totales calculados por backend con `PricingService` | ⏳ |
| 10 | Llamada HTTP a Openfactura fuera de la transacción de DB | ⏳ |
