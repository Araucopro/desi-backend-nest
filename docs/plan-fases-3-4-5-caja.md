# Plan de trabajo — Fases 3, 4 y 5 (caja)

Estado al cierre de la sesión anterior. Todo lo de abajo está **verificado contra
el código y contra la base de desarrollo**, no inferido.

## Punto de partida

### Fases ya cerradas

| Fase | Entrega | Verificación |
|---|---|---|
| 1 — Observabilidad | `AllExceptionsFilter` con `Logger`, log estructurado de `QueryFailedError`, `23505`→`409`, `requestId` en cabecera y body | `src/common/filters/exceptions.spec.ts` (unitario) |
| 2 — Concurrencia | Lock pesimista de la caja en `openSession`, idempotencia por operador+fecha, `409` con `sessionID`, `constraint` diferenciado por índice | `6/7` + el 7.º corregido; test de integración con Postgres real |

**Hallazgo colateral ya arreglado:** `ColumnNumericTransformer` convertía `null`
en `NaN` (`parseFloat(null)`), afectando a ~90 columnas `decimal`, varias
nullable. Corregido con test de regresión.

### Estado de la base de desarrollo (consultado hoy)

```
CashRegisterSession:  OPEN 3   |   CLOSED 6   |   SUSPENDED 0
Índice parcial: IDX_unique_open_session_per_register  → presente
Enum CashRegisterSession_status_enum → ('OPEN','SUSPENDED','CLOSED')
```

Sesiones `OPEN` huérfanas vigentes:

| Caja | `businessDate` | `openedAt` | Antigüedad | `sessionID` |
|---|---|---|---|---|
| CAJA-01 | 2026-09-22 | 2026-09-22 20:54 | 5 días | `6aac35f9-d149-4146-a105-24472c92b38a` |
| CAJA 2 | 2026-09-24 | 2026-09-24 21:52 | 3 días | `7d2e3118-7206-4f95-a911-678542c62ac3` |
| CAJA-FELIPE | 2026-09-13 | 2026-09-27 16:38 | < 1 día | `43fd594c-cd83-4487-94a8-3d46839f7135` |

Estas tres cajas **rechazan aperturas legítimas** con `409` hasta que se cierren.

### Deuda conocida y aceptada

- **RLS no está aplicado en desarrollo**: solo 3 tablas de RRHH tienen
  `relrowsecurity`. La app conecta como `postgres` (superusuario con
  `BYPASSRLS`). Las tablas de negocio no tienen políticas.
- **`assertUserCanAccessStore` abre una segunda conexión** al validar la tienda
  (el `EntityManager` de la transacción ya es el camino correcto; el repositorio
  global quedó eliminado). Sigue tomando una conexión extra del pool por
  apertura.
- **Paridad de entornos**: el runtime de producción debe conectarse con un rol
  sin `BYPASSRLS`. Verificado solo en desarrollo.

### Pendiente de confirmar antes de empezar

- [ ] Correr la suite completa en verde: `pnpm test:unit`,
      `pnpm test:integration`, `pnpm exec tsc --noEmit`. La sesión anterior no
      pudo ejecutarlos.
- [ ] Revisar si el fix del transformer merece PR propio.
- [ ] Borrar la base `d3si_test` que el arnés creó por error en el Railway de
      desarrollo (efecto del bug de carga de entorno, ya corregido).

---

## Fase 3 — Esquema e integridad

### 3.1 — Eliminar `SUSPENDED` del enum

**Verificado:** `SUSPENDED` aparece **solo** en la definición del enum
(`cash-register-session.entity.ts`) y en la migración que crea el tipo. Ningún
servicio lo asigna. `CashRegisterSessionStatus.SUSPENDED` no se lee en ninguna
parte. Las 8 coincidencias de `SUSPENDED` en el repo corresponden a
`TenantStatus`, que es otro enum y **no se toca**.

Y en datos: **0 filas**. El pre-flight que pedía el plan original está resuelto.

Migración nueva, en una sola transacción (`migrationsTransactionMode: 'each'`):

```sql
-- 1. El índice parcial referencia el tipo, así que se recrea al final.
DROP INDEX "public"."IDX_unique_open_session_per_register";

-- 2. Recrear el tipo sin SUSPENDED.
ALTER TYPE "public"."CashRegisterSession_status_enum"
  RENAME TO "CashRegisterSession_status_enum_old";
CREATE TYPE "public"."CashRegisterSession_status_enum"
  AS ENUM('OPEN', 'CLOSED');
ALTER TABLE "CashRegisterSession"
  ALTER COLUMN "status" TYPE "public"."CashRegisterSession_status_enum"
  USING "status"::text::"public"."CashRegisterSession_status_enum";
DROP TYPE "public"."CashRegisterSession_status_enum_old";

-- 3. Recrear el índice con el tipo nuevo.
CREATE UNIQUE INDEX "IDX_unique_open_session_per_register"
  ON "CashRegisterSession" ("tenantID", "cashRegisterID")
  WHERE status = 'OPEN';
```

El `USING ... ::text::` es obligatorio: no hay cast directo entre dos tipos enum
distintos.

- **Archivos:** migración nueva en `src/datasource/migrations/`, y quitar
  `SUSPENDED` de `src/cash-registers/entities/cash-register-session.entity.ts`.
- **`down()`:** inverso exacto (recrear el tipo con los 3 valores, recrear el
  índice).
- **Riesgo:** bajo pero **no trivial** — se toca el tipo de una columna en uso en
  una tabla con datos. Ir en **PR propio**, nunca junto a 3.2/3.3.
- **Verificación:** `\d "CashRegisterSession"` muestra el enum de 2 valores; el
  índice sigue existiendo y es único y parcial; el test de integración pasa.

### 3.2 — Documentar el índice único parcial en la entidad

`cash-register-session.entity.ts` ya tiene el bloque JSDoc con el DDL exacto y la
advertencia de que el índice referencia el enum. **Decisión tomada:** no añadir
`@Index(..., { where })`.

Motivo: con `synchronize: false` no crea nada, y un fragmento `where` mal escrito
contamina el próximo `migration:generate`. El JSDoc da el mismo valor documental
sin ese riesgo. **Cerrado, sin acción.**

### 3.3 — Verificación de índices críticos al arranque

Hoy nada detecta que falte un índice: `migrationsRun: false` y un restore o un
`migration:fresh` pueden dejar el invariante fuera de la base **en silencio**, y
el síntoma sería exactamente el bug que acabamos de arreglar.

Ya existen precedentes de `OnModuleInit` en el repo (`MasterService`,
`SiiCodesService`, `ReturnsService`, `DteService`, `DispatchGuidesService`), así
que hay convención que seguir.

- **Qué verificar:** que `IDX_unique_open_session_per_register` exista, sea
  `UNIQUE` y sea parcial (`WHERE status = 'OPEN'`).
- **Dónde:** servicio o helper en `src/cash-registers/`, registrado en el módulo.
- **Comportamiento en fallo:** decidir entre `throw` (abortar el arranque) o
  `logger.error` (seguir operando degradado). Recomendación: **abortar**, porque
  sin ese índice la invariante de "una sola sesión abierta" no existe y una
  carrera puede crear dos sesiones simultáneas sobre la misma caja.
- **Cuidado con tests:** si aborta el arranque, los `TestingModule` de los specs
  deben satisfacerlo. Preferible inyectar el `DataSource` y consultar
  `pg_indexes`, no usar entidades.

### 3.4 — Alinear RLS (decisión, no código)

Dos caminos, y hay que elegir uno:

- **A)** Aplicar RLS a las tablas de negocio en todos los entornos (migración
  grande, con `FORCE ROW LEVEL SECURITY` y políticas por tabla). Es lo que
  documentan `AGENTS.md` y `CLAUDE.md` como ya existente.
- **B)** Documentar explícitamente que en este entorno RLS no aplica y que
  producción se comporta distinto.

La opción A es de otro tamaño: **no cabe en este plan**. Propuesta: hacer B ahora
y abrir un ticket aparte para A, porque la diferencia entre entornos es un riesgo
real de "funciona en local, falla en producción".

---

## Fase 4 — Ciclo de vida de sesiones (la más urgente)

Es la fase que resuelve el síntoma original reportado por el usuario.

### 4.0 — Desbloquear las 3 cajas (operativo, hoy)

Antes de escribir código: decidir con negocio cómo cerrar las tres sesiones
huérfanas. Sin esto, CAJA-01, CAJA 2 y CAJA-FELIPE siguen rechazando aperturas.

Opciones: por el endpoint nuevo (4.2, preferible, deja traza) o por SQL directo
(solo si urge y con nota de auditoría).

### 4.1 — Diagrama de estados y caminos que dejan `OPEN`

**Ya levantado y verificado.** Solo falta volcarlo a un documento. Dos únicos
escritores de `CLOSED`:

- `cash-registers.service.ts` → `closeSession` (línea ~438)
- `cash-closings.service.ts` → `completeClosing` (línea ~477)

Ambos dentro de transacción. **No existe camino backend que deje una sesión
`OPEN` por un fallo del servidor**: el problema es *ausencia de cierre*.

Caminos que la dejan abierta indefinidamente:

| # | Camino | Evidencia | ¿Ocurrió? |
|---|---|---|---|
| 1 | El cliente nunca llama a cerrar | `openSession` es la única entrada; el cierre es 100 % del cliente | **Sí — 2 de 3 casos** (0 movimientos, 0 cobros) |
| 2 | Se opera y no se cierra | ídem | **Sí — 1 de 3** (1 movimiento, 1 cobro) |
| 3 | Arqueo `PENDING` abandonado | `cash-closings.service.ts:~303`; la sesión sigue `OPEN` | No (0 `PENDING`) |
| 4 | `rejectClosing` deja `OPEN` y exige arqueo nuevo | `cash-closings.service.ts:~496-542` | No (0 `REJECTED`) |
| 5 | `CashCount` en `DRAFT` bloquea el cierre | `cash-closings.service.ts:~422-432` | No (0 `DRAFT`) |
| 6 | `closeSession` bloqueado por transferencias abiertas | `cash-registers.service.ts:~362` | No (0 transferencias) |

**Conclusión:** el caso dominante (3 de 3) es el cliente que no cierra, no un
estado corrupto.

### 4.2 — Endpoint de resolución de huérfanas

**Alcance mínimo y suficiente:**

- `POST /cash-registers/:id/sessions/:sessionId/force-close` (o similar).
- Guard `isCashApprover(user)` — ya existe en `cash-registers.helpers.ts`, y hay
  precedentes de uso en `cash-movements.service.ts` y `cash-transfers.service.ts`.
- Reutilizar la lógica de `closeSession`: calcular `expectedCashBalance` con
  `sumSessionCashMovements`, sellar `closedAt`, `closedByUserID`, `status` y
  cerrar operadores con `closeSessionOperators`.
- **Traza de auditoría obligatoria:** motivo en `closingNotes` y
  `closedByUserID` con el aprobador, no con el cajero original.
- **Verificaciones previas:** rechazar si hay transferencias `PENDING`/`APPROVED`
  (mismo criterio que `closeSession`) y decidir qué hacer con un arqueo
  `PENDING`.
- **DTO** estricto (el `ValidationPipe` global rechaza campos no declarados):
  `reason` obligatorio.
- Swagger completo.

**Decisión de producto pendiente:** si el cierre forzado debe exigir que el
`businessDate` sea anterior al día contable actual, para no permitir cerrar una
sesión del día en curso por esta vía y saltarse el arqueo normal.

### 4.3 — Política de cruce de `businessDate`

Definir qué pasa cuando una sesión cruza el día contable. Opciones:

- alerta al abrir caja nueva;
- cierre forzado automático (riesgoso: sella saldos sin conteo);
- bloqueo con mensaje claro.

Recomendación: **bloqueo con mensaje claro + permiso de aprobador para forzar**,
que es justo lo que habilita 4.2. Alinea el síntoma con una salida explícita.

### 4.4 — Prevención (recomendado, alcance pequeño)

El 100 % de los casos observados es "el cliente no cierra". Medidas:

- Que `openSession` **advierta** (o rechace, según decisión) si ya existe una
  sesión `CLOSED` del mismo `businessDate` para esa caja — hoy no lo valida.
- Job nocturno que detecte sesiones `OPEN` de días anteriores y notifique.
- Coordinación con frontend: **deshabilitar el botón durante la petición** para
  cerrar H1 (doble envío). Fuera del alcance de este backend, pero es el otro
  camino que el plan original marcó como probable.

---

## Fase 5 — Limpieza y refactor

Sin cambio funcional. **Cada tarea en PR separado**, y ninguna mezclada con
Fases 3-4.

| ID | Tarea | Estado |
|---|---|---|
| 5.1 | Extraer helper "insert + traducir `23505` a `409`" | Pendiente. Aparece en `cash-registers`, `cash-closings` (~330), `cash-register-session-users` (~201), `cash-counts` (~260), `cash-denominations` (~115), `payment-methods`, `cash-movement-reasons`, `sales`, `returns`, `dispatch-guides`, `dte`, `tenant-provisioning` |
| 5.2 | Unificar resolución del `userId` | **Hecho** en `openSession`. Queda `closeSession` (`user.type === 'master' ? … : user.userId \|\| user.id`). Usar `resolveActingUserId` |
| 5.3 | Unificar `assertUserCanAccessStore` | **Hecho**: wrapper privado eliminado, se usa el helper con el `EntityManager` de la transacción en los 7 servicios |
| 5.4 | Revisar `findOpenSessionOrFail` y el lock | **Verificado, sin cambios.** Los 6 flujos que mueven saldo usan `lock: true`; `sales.service.ts:~385` usa `false` a propósito (pre-validación antes del DTE, la persisten con lock) |
| 5.5 | Documentar que un fallo en `attachSessionOperator` revierte la apertura | Pendiente, solo documentación |

### Deuda técnica adicional detectada

- **Doble conexión en `assertUserCanAccessStore`:** el `EntityManager` de la
  transacción ya es el camino correcto, pero sigue abriendo una conexión extra
  del pool por apertura. Con N aperturas concurrentes eso es 2N conexiones. El
  test de integración lo fuerza (`poolSize: 20`) y está documentado.
- **`closeSession` calcula `userId` inline** en vez de usar
  `resolveActingUserId` (ver 5.2).
- **Orden de locks:** `openSession` bloquea la caja y luego lee la sesión;
  `closeSession` bloquea la sesión directo. No comparten fila, así que no hay
  riesgo de deadlock hoy, pero conviene dejar el orden documentado antes de que
  alguien agregue un lock sobre la caja en el camino de cierre.

---

## Orden recomendado

```
4.0 (desbloquear cajas)  ← urgente, operativo
   │
4.1 (documento) ──► 4.2 (endpoint) ──► 4.3 (política)
   │
   ├──► 3.1 (migración SUSPENDED)     ← PR aislado
   ├──► 3.3 (chequeo de índices)      ← PR aislado
   ├──► 3.4 (decisión RLS: doc)
   └──► 5.1 / 5.2 / 5.5               ← PRs separados

5.3, 5.4: cerradas, sin acción.
```

**Justificación del orden:** la Fase 4 ataca el síntoma reportado y tiene el
mayor impacto inmediato. La Fase 3 es prevención de un fallo silencioso. La 5 es
higiene y puede esperar sin costo.

## Verificación de cada fase

| Fase | Cómo se prueba |
|---|---|
| 3.1 | `\d "CashRegisterSession"` con enum de 2 valores; índice único parcial intacto; migración `up`/`down` idempotentes |
| 3.3 | Test que borra el índice y verifica que el arranque falla con mensaje claro |
| 4.2 | Test de integración: sesión huérfana → cierre forzado → la caja vuelve a aceptar apertura; sin permiso de aprobador → `403`; con transferencias abiertas → `400` |
| 4.3 | Test de integración: sesión de ayer bloquea apertura y el forzado la habilita |
| 5.x | `pnpm test:unit` + `pnpm test:integration` + `pnpm exec tsc --noEmit` en verde, sin cambios de comportamiento |

## Comandos

```powershell
pnpm exec tsc --noEmit
pnpm test:unit
docker compose up -d db
pnpm test:integration
pnpm migration:run      # requiere pnpm build antes
```

> Nota sobre Jest: en entornos con la caché de `%TEMP%` bloqueada hace falta
> `--cacheDirectory` escribible. `integration` ya corre con `--runInBand`.
