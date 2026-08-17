## Evaluación directa

El problema no es que el backend falle, es **acoplamiento de capas dentro de la misma clase**. Los 5 servicios más grandes (`dte.service.ts` 1143 líneas, `reports.service.ts` 787, `master.service.ts` 747, `pricing.service.ts` 731, `offer.service.ts` 730) mezclan sistemáticamente tres responsabilidades distintas en un solo archivo: (1) I/O externo o persistencia, (2) cálculo/transformación de dominio sin dependencias externas, (3) orquestación del flujo. Hexagonal completo no es realista para este tamaño de equipo/timeline, lo confirmo abajo con evidencia, no es solo una opinión sobre "es mucho trabajo". Pero **ya existe un precedente funcional en el propio repo** (`inventory-stock.helper.ts`) que resuelve el mismo problema sin tocar módulos de Nest ni DI. La recomendación es generalizar ese patrón, no inventar uno nuevo.

## Fallos detectados (con evidencia)

**1. `runInTransaction<T>` duplicado idéntico en 11 servicios**

```
sales.service.ts, purchase-orders.service.ts, store-monthly-targets.service.ts,
storeproduct.service.ts, expenses.service.ts, inventory.service.ts,
products.service.ts, dte.service.ts, transfers.service.ts,
pricing.service.ts, offer.service.ts
```

Mismo código, copy-paste literal, 7 líneas × 11 = deuda pura. Y ya divergió: **`reports.service.ts` reimplementó su propia versión** con un `EntityManager` falso (`as unknown as EntityManager`, línea 112) que solo soporta 3 entidades hardcodeadas y lanza `Error` genérico para cualquier otra. Es la prueba concreta de que duplicar infraestructura sin centralizarla genera bugs silenciosos: si mañana alguien agrega una entidad a ese fallback y olvida el `if`, falla en runtime sin aviso de compilador.

**2. `dte.service.ts` mezcla 4 capas no relacionadas** (evidencia por nombre de método/línea):
| Concern | Métodos | Líneas aprox. |
|---|---|---|
| Cliente HTTP Openfactura | `callOpenfactura`, `createOpenfacturaDocument`, `getOpenfacturaDocument`, `requireApikey`, `maskApikey` | ~150 |
| Normalización de respuesta | `buildResponse`, `normalizeStatus`, `buildNormalizedPayload`, `applyFinalStatusToNormalized`, `formatJson`, `previewJson/Text` | ~150 |
| Resolución de ítems / costeo | `resolveVariation`, `mapToDocumentPayload`, `snapshotItemCosts` | ~200 |
| Orquestación real (lo que importa) | `create`, `prepare`, `finalizeInTransaction`, `reconcile`, `reconcilePendingDocuments` | ~350 |

`create()`, que es lo que preguntaste que cuesta encontrar, está en la **línea 1020 de 1143**, literalmente al final del archivo, después de 4 capas que no son orquestación.

**3. `pricing.service.ts` esconde un motor de descuentos completo dentro de un "service" transaccional**: `applyStandardOffer`, `applyBuyXGetY`, `applyBundle`, `grantFreeUnits`, `recordAutomaticDiscount`, `applyManualDiscount` (líneas 504-686) son cálculo puro sobre `MutableCartLine[]`, sin acceso a DB. Están mezcladas con `updatePrice`, `getPriceHistory` (persistencia real).

**4. `master.service.ts` mezcla 3 dominios**: autenticación (`loginMaster`, `impersonate`), CRUD de tenant (`createTenant`, `updateTenant`, `setStatus`), y provisioning (`provisionTenant`, `createTenantUser`, `ensureMasterUserBootstrap`). Son ciclos de vida distintos con distinta frecuencia de cambio, buen candidato a split, pero de mayor riesgo (toca DI real).

## Alternativas

| Opción                                                                                                              | Qué implica                                                                                                                                    | Riesgo                                                                                                                                                                             | Cuándo tiene sentido                                                                                        |
| ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **A. Hexagonal completo** (ports & adapters, dominio aislado de Nest)                                               | Reescribir límites de módulo, invertir dependencias DB/HTTP detrás de interfaces, mover entidades TypeORM fuera del dominio                    | Alto. Sin tests de contrato ni cobertura homogénea (confirmado: solo algunos servicios tienen `.spec.ts` robusto), es refactor a ciegas sobre un sistema que ya está en producción | Solo si el equipo va a mantener esto años y ya tiene tests de caracterización completos. No es tu caso hoy. |
| **B. Extracción incremental por capas dentro del mismo módulo** (generalizar el patrón `inventory-stock.helper.ts`) | Sacar funciones puras y clientes I/O a archivos nuevos _dentro de la misma carpeta de módulo_, sin tocar rutas, DI global, ni contratos de API | Bajo. Cada extracción es un refactor mecánico verificable con los tests existentes                                                                                                 | Es tu caso: querés legibilidad sin mover la estructura actual.                                              |
| **C. No hacer nada, seguir agregando features**                                                                     | ,                                                                                                                                              | El próximo bug de duplicación (como el fake-manager de reports.service.ts) va a repetirse en otro servicio                                                                         | Descartada, ya la estás descartando vos mismo.                                                              |

Recomiendo **B**. No es "hexagonal light" como concepto de marketing, es aplicar Single Responsibility File por File, reutilizando el patrón que el propio equipo ya validó en `inventory-stock.helper.ts`: funciones puras que reciben `manager: EntityManager` explícito, sin `@Injectable`, sin wiring nuevo en módulos.

## Recomendación final, Plan de trabajo

Orden por relación riesgo/beneficio, cada fase cierra con: compila + tests existentes en verde + line count objetivo. No avanzar a la fase N+1 sin ese criterio cumplido.

**Fase 0, Eliminar duplicación transversal (1-2 días, riesgo mínimo)**
Crear `src/common/services/transaction-runner.service.ts`, `@Injectable()`, inyectando `DataSource` y `@Optional() TenantContextService`, con el único método `run<T>(callback)`. Reemplazar las 11 copias idénticas por inyección de este servicio. **Corregir el fake-manager de `reports.service.ts`** en el mismo paso, es el único que realmente diverge y es el que más riesgo de bug silencioso tiene.
_Beneficio:_ elimina ~80 líneas duplicadas, centraliza el único punto donde vive la lógica multitenant de transacciones, para que no vuelva a divergir.

**Fase 1, Aislar cliente HTTP de Openfactura**
`src/dte/openfactura-client.service.ts` (`@Injectable`, recibe `ConfigService`): mover `callOpenfactura`, `createOpenfacturaDocument`, `getOpenfacturaDocument`, `requireApikey`, `maskApikey`. `DteService` lo inyecta por constructor.
_Beneficio adicional no obvio:_ hoy testear `dte.service.spec.ts` probablemente mockea `fetch` global; con esto se mockea el cliente completo, tests más simples y rápidos de escribir a futuro.

**Fase 2, Aislar normalización de respuesta**
`src/dte/dte-response.mapper.ts`: funciones puras (no clase) `buildResponse`, `normalizeStatus`, `buildNormalizedPayload`, `applyFinalStatusToNormalized`, `formatJson`, `previewJson`, `previewText`. Mismo patrón que `inventory-stock.helper.ts`: reciben datos, no dependencias inyectadas.

**Fase 3, Aislar resolución de ítems**
Mover `resolveVariation`, `mapToDocumentPayload`, `snapshotItemCosts` a `src/dte/dte-mapper.service.ts` (ya existe, es su lugar natural) o a un nuevo `dte-item-resolver.ts` si querés mantener `dte-mapper.service.ts` enfocado solo en construir el payload de salida (que es lo que hace hoy).

_Resultado esperado tras Fase 3:_ `dte.service.ts` de 1143 → ~350-400 líneas, `create()` visible en los primeros 2 scrolls del archivo, conteniendo solo: preparar → llamar cliente → finalizar. Cero cambios de comportamiento, cero cambios de rutas o contratos públicos.

**Fase 4, Replicar en `pricing.service.ts`**
Extraer el motor de descuentos (`applyStandardOffer`, `applyBuyXGetY`, `applyBundle`, `grantFreeUnits`, `recordAutomaticDiscount`, `applyManualDiscount`) a `src/pricing/discount-engine.ts`, funciones puras sobre `MutableCartLine[]`. `pricing.service.ts` queda como orquestador: carga datos → `discount-engine.calculate()` → persiste.

**Fase 5, `master.service.ts` (dejar al final, mayor riesgo)**
Split en `TenantService` (CRUD), `TenantProvisioningService` (`provisionTenant`, `createTenantUser`, `ensureMasterUserBootstrap`), `MasterAuthService` (`loginMaster`, `impersonate`). A diferencia de las fases 1-4, esto sí crea providers nuevos en el módulo, requiere actualizar `multitenant.module.ts` y revisar imports cruzados. Hacerlo último, con Fase 0 ya estabilizada como red de seguridad.

**Fase 6, Adapter real (no hacer ahora, dejarlo escrito para cuando aplique)**
Una interfaz `DteProviderPort` con `OpenfacturaAdapter` como única implementación solo se justifica el día que haya un segundo proveedor SII real. Hacerlo antes es over-engineering, es el error inverso al que tenés hoy.

**Qué no incluye este plan, deliberadamente:** no toca rutas HTTP, no toca DTOs públicos, no toca el esquema de DB, no introduce nuevos módulos de Nest hasta la Fase 5. Es exactamente la restricción que pediste ("sin afectar tanto la estructura actual").
