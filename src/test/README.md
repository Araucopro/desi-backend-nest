# Tests de integración

Corren contra **PostgreSQL real**. Existen porque la concurrencia de la apertura
de caja no se puede verificar con repositorios mockeados: el invariante lo
sostiene un índice único parcial de la base
(`IDX_unique_open_session_per_register`) y la serialización la aporta un lock
pesimista de fila.

## Preparación

```bash
docker compose up -d db
pnpm test:integration
```

El arnés **recrea el esquema `public` en cada corrida**
(`DROP SCHEMA ... CASCADE` + `runMigrations`) sobre la base `d3si_test` del
servicio `db`. Dropea el esquema, nunca la base: `dropDatabase()` se llevaría la
base entera y la corrida siguiente fallaría con `database "d3si_test" does not
exist`.

Si la base no existe, el arnés la crea: `src/test/ensure-database.ts` abre una
conexión administrativa a `postgres` y ejecuta `CREATE DATABASE` si falta. Ese
módulo solo depende de `pg` a propósito, porque lo comparten `global-setup.ts`
(corre fuera del contexto de ts-jest y no puede importar entidades ni
migraciones) y `integration/database.util.ts`.

Detalle que costó encontrar: **no se puede usar `DataSource.query()`** para eso.
El `QueryRunner` de TypeORM abre una transacción implícita en Postgres y
`CREATE DATABASE` no puede correr dentro de una transacción (`25001`), así que la
creación fallaba siempre y el síntoma seguía siendo `database "..." does not
exist`.

El contenedor crea `d3si_test` al inicializar su volumen y
`docker/initdb/01-uuid-ossp.sql` agrega la extensión que las migraciones usan
pero no declaran. Si el volumen ya existía, esos scripts no corren: de ahí la
recuperación automática en el arnés.

Por seguridad, `prepareTestDatabase()` aborta si `PGDATABASE` no termina en
`_test`. Aun así, no apuntes a una base con datos que quieras conservar.

Los datos de prueba que se crean son: `roles` → `Users` → `UserStore` (la cadena
completa, porque `UserStore.userID` tiene FK a `Users` y `Users` tiene FK
compuesta a `roles`), más `Store`, `CashRegister` y `CashRegisterSession`.

## Por qué el DataSource lo inicializa el arnés

El test reemplaza el provider `DataSource` de `DatabaseModule` para poder
dimensionar el pool por encima del default de TypeORM (10). Consecuencia: la
factory que normalmente llama a `initialize()` deja de correr, así que el arnés
debe hacerlo **antes** de entregar la instancia. Si se olvida, `driver.master`
queda en `null` y cada consulta falla con `TypeORMError: Driver not Connected`.

En sentido inverso, `moduleRef.close()` **no** destruye esa conexión (el provider
efectivo es un `useValue`, no la factory que registra el hook de shutdown de
TypeORM), por eso el `afterAll` la cierra explícitamente.

## Orden de arranque de Jest (trampa importante)

Jest ejecuta, en este orden:

1. `globalSetup` (`src/test/global-setup.ts`) — **antes** del entorno de tests;
2. `setupFiles` (`src/test/setup-env.ts`);
3. los archivos de test.

Por eso `loadTestEnv()` se llama en **ambos** puntos (`src/test/load-env.ts` lo
comparte). Si `globalSetup` no carga `.env.test` por su cuenta, lee el `.env` de
la raíz —que en este repo apunta al proxy de Railway— y crea/comprueba la base
en **otro servidor** que el de los tests. El síntoma es desconcertante: la traza
dice `base "d3si_test" ya existe en 127.0.0.1:5433` y a la vez las queries
fallan con `database "d3si_test" does not exist`, porque la comprobación y la
conexión de la app están hablando con servidores distintos.

> Nota: la primera versión de este arnés, con ese bug, llegó a crear una base
> `d3si_test` en el Railway de desarrollo. Si aparece una, bórrala.

## Configuración

`src/test/.env.test` se carga antes de importar cualquier módulo de la app
(`src/test/setup-env.ts`). Las variables ya presentes en el shell tienen
prioridad, así que puedes redirigir el arnés sin editar el archivo:

```bash
$env:PGHOST="127.0.0.1"; $env:PGPORT="5433"; pnpm test:integration
```

| Variable | Rol |
|---|---|
| `PGOWNERHOST/PORT/USER/PASSWORD` | Rol dueño: ejecuta las migraciones y el seed |
| `PGHOST/PGPORT/PGUSER/PGPASSWORD` | Rol de la aplicación (el que usa `DatabaseModule`) |
| `PG_RUNTIME_USER` / `PG_RUNTIME_PASSWORD` | Si están definidos, la app conecta con ese rol y el arnés habilita RLS |

## Aislamiento por tenant (RLS)

El bloque `aislamiento por tenant` aplica políticas RLS siguiendo el patrón de
`1788887000000-CreateHrAttendance.ts` y ejecuta la apertura real.

Punto importante: **PostgreSQL exime al dueño de una tabla de sus políticas
RLS**, y el dueño del esquema es el rol que corre las migraciones. Si la app
conecta con ese mismo rol, las políticas no se aplican y el test no probaría
nada. Por eso `enableCashRls()` aplica `ALTER TABLE ... FORCE ROW LEVEL SECURITY`
además de `ENABLE`: con `FORCE`, el dueño queda sujeto a las políticas igual que
un rol runtime (`app_runtime`, sin `BYPASSRLS`) en producción.

No se usa `row_security = force`: ese GUC es booleano y **no admite `force`**
(`parameter "row_security" requires a Boolean value`). El forzado es una
propiedad de la tabla, no de la sesión.

Para probar contra un rol runtime de verdad, define `PG_RUNTIME_USER` con un rol
sin privilegios de dueño y sin `BYPASSRLS`.

## Cobertura

`src/test/integration/cash-registers-open-session.integration-spec.ts`:

| Caso | Qué protege |
|---|---|
| N=10 aperturas simultáneas → 1 sesión, **10 respuestas con el mismo `sessionID`**, 0 errores | El invariante, la idempotencia y que el lock serialice |
| Aperturas simultáneas en cajas distintas | Que el lock no globalice la contención |
| Conflicto con otro cajero → 409 con `sessionID` | Recuperabilidad en el cliente |
| Reintento mismo cajero + misma fecha → idempotente | Falso error por doble envío |
| Mismo cajero, otra fecha contable → 409 | No confundir idempotencia con reapertura |
| Cerrar y reabrir | Continuidad operativa |
| Acceso a tienda con RLS forzado | Que la validación use la conexión de la transacción |

> El test concurrente **no** espera ningún `409`, y eso es una afirmación fuerte
> sobre el lock: sin él, los 9 intentos que pierden la carrera contra el índice
> único volverían como `409` (correcto para el invariante, pero sin idempotencia)
> y el test fallaría en la aserción de `rejected` vacío. Si ves ese patrón,
> revisa el lock de `openSession` antes que el índice.
