# Ciclo de vida de sesiones de caja

## Estados

`CashRegisterSessionStatus` tiene **dos** valores desde la migración
`1788891000000-DropCashRegisterSessionSuspendedStatus.ts`:

```
        openSession                    closeSession
   ────────────────────►  OPEN  ────────────────────►  CLOSED
                          │  │                        ▲
                          │  └────────────────────────┤
                          │      completeClosing      │
                          │      (arqueo formal)      │
                          │                           │
                          └───────────────────────────┘
                             forceCloseSession (Fase 4.2)
```

`SUSPENDED` se eliminó porque nunca se asignaba: era un estado alcanzable en el
tipo pero no en el flujo. Peor aún, al quedar fuera del índice parcial
`WHERE status = 'OPEN'`, una sesión en ese estado era invisible para
`openSession`: la caja rechazaba aperturas para siempre sin explicación.

## Escritores de `CLOSED`

Solo dos servicios marcan una sesión como cerrada, y ambos lo hacen dentro de una
transacción con la sesión bloqueada (`FOR UPDATE`):

| Ruta                      | Método                                   | Archivo                     |
| ------------------------- | ---------------------------------------- | --------------------------- |
| Cierre directo            | `CashRegistersService.closeSession`      | `cash-registers.service.ts` |
| Cierre forzado (Fase 4.2) | `CashRegistersService.forceCloseSession` | `cash-registers.service.ts` |
| Arqueo formal             | `CashClosingsService.completeClosing`    | `cash-closings.service.ts`  |

Los dos primeros comparten `CashRegistersService.sealSession`, que es el único
punto donde se calcula el saldo esperado y se cierran los turnos de operadores.
Esto es deliberado: si cada camino calculara el arqueo por su cuenta, tarde o
temprano divergirían.

## Caminos que dejan una sesión `OPEN`

**No existe ningún camino en el backend que deje una sesión `OPEN` por un fallo
del servidor.** Si una operación falla, la transacción revierte y no queda sesión.
El problema es la _ausencia de cierre_, no un estado corrupto.

| #   | Camino                                               | Evidencia                                                         | ¿Ocurrió en desarrollo?                         |
| --- | ---------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------- |
| 1   | El cliente nunca llama a cerrar                      | `openSession` es la única entrada; el cierre es 100 % del cliente | **Sí — 2 de 3 casos** (0 movimientos, 0 cobros) |
| 2   | Se opera y no se cierra                              | ídem                                                              | **Sí — 1 de 3** (1 movimiento, 1 cobro)         |
| 3   | Arqueo `PENDING` abandonado                          | `cash-closings.service.ts`; la sesión sigue `OPEN`                | No (0 `PENDING`)                                |
| 4   | `rejectClosing` deja `OPEN` y exige arqueo nuevo     | `CashClosingsService.rejectClosing`                               | No (0 `REJECTED`)                               |
| 5   | `CashCount` en `DRAFT` bloquea el cierre             | `completeClosing` → `findCashCountByStatus(DRAFT)`                | No (0 `DRAFT`)                                  |
| 6   | `closeSession` bloqueado por transferencias abiertas | `assertNoOpenTransfers`                                           | No (0 transferencias)                           |

**Conclusión:** el caso dominante (3 de 3) es el cliente que no cierra.

## Salidas

| Situación                                     | Salida                                                     |
| --------------------------------------------- | ---------------------------------------------------------- |
| Cierre normal con conteo                      | `POST /cash-registers/:id/sessions/close`                  |
| Cierre conciliado con arqueo formal           | `startClosing` → `registerCount` → `completeClosing`       |
| Sesión huérfana de un día anterior            | `POST /cash-registers/:id/sessions/:sessionId/force-close` |
| Sesión del día en curso con el cajero ausente | El mismo cierre forzado, con aprobador y motivo            |
| Transferencia en curso bloqueando el cierre   | Completar, rechazar o cancelar la transferencia primero    |

## Cierre forzado: qué hace y qué no

`forceCloseSession` (Fase 4.2) existe para que la salida de una sesión huérfana
sea explícita, con permiso y traza, en vez de SQL manual.

**Hace:**

- exige rol de aprobador (`isCashApprover`: `admin`, `store_manager`, o MASTER);
- exige un motivo escrito (`reason`, mínimo 10 caracteres);
- sella `expectedCashBalance` recalculado desde los movimientos `POSTED`;
- registra `closedByUserID` con el **aprobador**, no con el cajero original;
- cierra los turnos de los operadores activos;
- deja `closingNotes` con el prefijo `[CIERRE FORZADO]`, el `ISOString` del
  instante y el motivo, para poder filtrar estos cierres por SQL.

**No hace:**

- no inventa un arqueo: deja `countedCashBalance` y `cashDifference` en `null`.
  Un `0` aparentaría una conciliación que nadie hizo;
- no toca transferencias de fondos;
- no cierra el arqueo `PENDING` asociado.

**Rechaza con:**

| Código | Condición                                                            |
| ------ | -------------------------------------------------------------------- |
| `400`  | La sesión tiene transferencias `PENDING`/`APPROVED`                  |
| `403`  | El usuario no es aprobador, o no tiene acceso a la tienda de la caja |
| `404`  | La caja o la sesión no existen en el tenant                          |
| `409`  | La sesión no está `OPEN`, o tiene un arqueo `PENDING` en curso       |

## Orden de locks

Dejarlo documentado antes de que alguien agregue un lock sobre la caja en un
camino de cierre:

| Camino               | Primero                           | Después                                  |
| -------------------- | --------------------------------- | ---------------------------------------- |
| `openSession`        | `CashRegister` (lock pesimista)   | `CashRegisterSession` (lectura sin lock) |
| `closeSession`       | `CashRegister` (lectura sin lock) | `CashRegisterSession` (lock pesimista)   |
| `forceCloseSession`  | `CashRegister` (lectura sin lock) | `CashRegisterSession` (lock pesimista)   |
| Cobros y movimientos | `CashRegister` (lectura sin lock) | `CashRegisterSession` (lock pesimista)   |

`openSession` es el único que bloquea la caja. No comparte fila con los caminos
de cierre, así que **hoy no hay riesgo de deadlock**, pero la asimetría es el
detalle a revisar si alguien agrega un `FOR UPDATE` sobre `CashRegister` en un
camino de cierre.
