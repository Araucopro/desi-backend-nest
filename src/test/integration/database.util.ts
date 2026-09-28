/**
 * Utilidades del arnés de integración.
 *
 * Regla del repo: los servicios resuelven el `tenantID` desde
 * `TenantContextService` (`AsyncLocalStorage`), así que las consultas se
 * ejecutan dentro de `dataSource.transaction` con `app.tenant_id` aplicado.
 * Igual que `UserstoresService`, estas utilidades abren la transacción por su
 * cuenta cuando no reciben un `EntityManager`.
 */
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import { UserRole } from '../../users/entities/user.entity';
import { ensureDatabaseExists } from '../ensure-database';

/** Tablas de caja que el arnés puede someter a RLS. */
export const CASH_RLS_TABLES = [
  'Store',
  'UserStore',
  'CashRegister',
  'CashRegisterSession',
  'CashRegisterSessionUser',
] as const;

export type TestDatabase = {
  /** Rol dueño: ejecuta migraciones y puede operar sobre tablas con RLS. */
  owner: DataSource;
  database: string;
  tenantID: string;
};

export function buildOwnerDataSource(): DataSource {
  return new DataSource({
    type: 'postgres',
    host: process.env.PGOWNERHOST ?? process.env.PGHOST ?? '127.0.0.1',
    port: Number(process.env.PGOWNERPORT ?? process.env.PGPORT ?? 5433),
    username: process.env.PGOWNERUSER ?? process.env.PGUSER ?? 'postgres',
    password:
      process.env.PGOWNERPASSWORD ?? process.env.PGPASSWORD ?? 'postgres',
    database: process.env.PGDATABASE ?? 'd3si_test',
    entities: [__dirname + '/../../**/*.entity{.ts,.js}'],
    migrations: [__dirname + '/../../datasource/migrations/*{.ts,.js}'],
    migrationsTransactionMode: 'each',
    synchronize: false,
  });
}

/**
 * Conexión de la aplicación.
 *
 * `poolSize` se eleva por encima del default (10): cada apertura concurrente
 * toma dos conexiones (la transacción y la lectura de `UserStore` de
 * `assertUserCanAccessStore`), así que 10 aperturas simultáneas no caben en el
 * pool por defecto y el test mediría contención de pool en vez de la carrera.
 *
 * No se toca `row_security`: es un GUC **booleano** (`on`/`off`) y no admite
 * `force`. El forzado de las políticas se logra con
 * `ALTER TABLE ... FORCE ROW LEVEL SECURITY` (ver `enableCashRls`), que es lo
 * que quita la exención del dueño de la tabla.
 */
export function buildAppDataSource(): DataSource {
  return new DataSource({
    type: 'postgres',
    host: process.env.PGHOST ?? process.env.PGOWNERHOST ?? '127.0.0.1',
    port: Number(process.env.PGPORT ?? process.env.PGOWNERPORT ?? 5433),
    username: process.env.PGUSER ?? process.env.PGOWNERUSER ?? 'postgres',
    password:
      process.env.PGPASSWORD ?? process.env.PGOWNERPASSWORD ?? 'postgres',
    database: process.env.PGDATABASE ?? 'd3si_test',
    entities: [__dirname + '/../../**/*.entity{.ts,.js}'],
    synchronize: false,
    poolSize: 20,
  });
}

/**
 * Recrea el esquema `public` desde las migraciones versionadas —la misma fuente
 * de verdad que producción— y devuelve el contexto del test.
 *
 * Se dropea el **esquema**, nunca la base: `DataSource.dropDatabase()` elimina
 * la base entera y, como `runMigrations()` no la recrea, la segunda llamada
 * falla con `database "..." does not exist`.
 *
 * `uuid-ossp` se vuelve a crear explícitamente porque ninguna migración lo
 * declara: es un prerrequisito del entorno y `DROP SCHEMA ... CASCADE` se lo
 * lleva si vivía en `public`.
 */
export async function prepareTestDatabase(): Promise<TestDatabase> {
  const owner = buildOwnerDataSource();
  const database = owner.options.database as string;

  // Guarda antes de tocar nada: el arnés dropea un esquema en cada corrida.
  if (!database.endsWith('_test')) {
    throw new Error(
      `El arnés recrea el esquema en cada corrida y solo acepta bases terminadas en "_test"; recibió "${database}".`,
    );
  }

  await ensureDatabaseExists(database);

  await owner.initialize();

  // Traza a stderr para que un fallo de esquema sea diagnosticable sin adivinar
  // en qué paso se rompió la preparación.
  process.stderr.write(
    `[integration] recreando esquema en "${database}" (${owner.options.database})\n`,
  );

  await owner.query('DROP SCHEMA IF EXISTS "public" CASCADE');
  await owner.query('CREATE SCHEMA "public"');
  await owner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  await owner.runMigrations();
  process.stderr.write(`[integration] esquema listo en "${database}"\n`);

  return {
    owner,
    database,
    tenantID: randomUUID(),
  };
}

export async function teardownTestDatabase(
  context: TestDatabase,
): Promise<void> {
  if (context.owner.isInitialized) {
    await context.owner.destroy();
  }
}

/**
 * Habilita RLS sobre las tablas de caja siguiendo exactamente el patrón de
 * `1788887000000-CreateHrAttendance.ts`.
 *
 * `FORCE ROW LEVEL SECURITY` es la pieza clave cuando la app conecta con el
 * mismo rol que corrió las migraciones: sin él, PostgreSQL exime al **dueño**
 * de la tabla de sus propias políticas y el test de aislamiento no probaría
 * nada. Con `FORCE`, el dueño queda sujeto a las políticas igual que un rol
 * runtime (`app_runtime`, sin `BYPASSRLS`) en producción.
 */
export async function enableCashRls(context: TestDatabase): Promise<void> {
  for (const table of CASH_RLS_TABLES) {
    await context.owner.query(
      `ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`,
    );
    await context.owner.query(
      `ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`,
    );
    await context.owner.query(
      `CREATE POLICY "${table}_tenant_isolation" ON "${table}"
       USING ("tenantID" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
       WITH CHECK ("tenantID" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)`,
    );
  }
}

/**
 * Ejecuta el callback en una transacción con `app.tenant_id` aplicado, igual
 * que `TenantContextService.transaction`.
 */
export function runInTenant<T>(
  dataSource: DataSource,
  tenantID: string,
  callback: (manager: EntityManager) => Promise<T>,
): Promise<T> {
  return dataSource.transaction(async (manager) => {
    await manager.query(`SELECT set_config('app.tenant_id', $1, true)`, [
      tenantID,
    ]);
    return callback(manager);
  });
}

export async function seedStore(
  context: TestDatabase,
  overrides: { storeID?: string; name?: string } = {},
): Promise<string> {
  const storeID = overrides.storeID ?? randomUUID();
  const name = overrides.name ?? `Tienda ${storeID.slice(0, 8)}`;

  await context.owner.query(
    `INSERT INTO "Store"
       ("storeID", "tenantID", "location", "rut", "address", "phone", "city", "email", "name", "type", "isCentralStore")
     VALUES ($1, $2, 'Santiago', '76.123.456-7', 'Av. Siempre Viva 742', '+56900000000', 'Santiago', $3, $4, 'central', false)`,
    [storeID, context.tenantID, `${storeID}@test.local`, name],
  );

  return storeID;
}

export async function seedCashRegister(
  context: TestDatabase,
  params: { storeID: string; code: string; status?: string },
): Promise<string> {
  const cashRegisterID = randomUUID();

  await context.owner.query(
    `INSERT INTO "CashRegister"
       ("cashRegisterID", "tenantID", "storeID", "code", "name", "status")
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      cashRegisterID,
      context.tenantID,
      params.storeID,
      params.code,
      `Caja ${params.code}`,
      params.status ?? 'ACTIVE',
    ],
  );

  return cashRegisterID;
}

/**
 * Crea un rol, un usuario y su asignación vigente a la tienda.
 *
 * `UserStore.userID` tiene FK a `Users(userID)` y `Users` tiene FK compuesta
 * `(tenantID, roleID)` a `roles(tenantID, id)`, así que hay que crear la cadena
 * completa: no basta con inventar un UUID de usuario.
 *
 * `roleID`/`role` los usa **solo** la fila de `Users`: el rol que evalúa el
 * servicio viene del JWT, no de la base. Por eso un `STORE_MANAGER` real aquí
 * mantiene la coherencia entre el payload y el dato persistido.
 */
export async function seedUserWithStore(
  context: TestDatabase,
  params: { storeID: string; role?: UserRole },
): Promise<string> {
  const roleID = randomUUID();
  const userID = randomUUID();
  const role = params.role ?? UserRole.STORE_MANAGER;

  await context.owner.query(
    `INSERT INTO "roles" ("id", "tenantID", "name", "isSystem")
     VALUES ($1, $2, $3, false)`,
    [roleID, context.tenantID, `rol-${roleID.slice(0, 8)}`],
  );

  await context.owner.query(
    `INSERT INTO "Users"
       ("userID", "tenantID", "roleID", "email", "name", "role", "isSystem", "status", "password", "sessionVersion")
     VALUES ($1, $2, $3, $4, $5, $6, false, 'ACTIVE', 'no-password', 1)`,
    [
      userID,
      context.tenantID,
      roleID,
      `user-${userID}@test.local`,
      `Cajero ${userID.slice(0, 8)}`,
      role,
    ],
  );

  await context.owner.query(
    `INSERT INTO "UserStore" ("userStoreID", "tenantID", "userID", "storeID", "effectiveFrom")
     VALUES ($1, $2, $3, $4, CURRENT_DATE)`,
    [randomUUID(), context.tenantID, userID, params.storeID],
  );

  return userID;
}

export async function findStoreIDOfRegister(
  context: TestDatabase,
  cashRegisterID: string,
): Promise<string> {
  const rows = (await context.owner.query(
    `SELECT "storeID" FROM "CashRegister" WHERE "cashRegisterID" = $1`,
    [cashRegisterID],
  )) as unknown as Array<{ storeID: string }>;

  return rows[0].storeID;
}

export async function countSessions(
  context: TestDatabase,
  cashRegisterID: string,
): Promise<number> {
  const rows = (await context.owner.query(
    `SELECT COUNT(*)::int AS total FROM "CashRegisterSession" WHERE "cashRegisterID" = $1`,
    [cashRegisterID],
  )) as unknown as Array<{ total: number }>;

  return rows[0]?.total ?? 0;
}

/**
 * Inserta directamente una sesión de caja. Permite fijar `status` y
 * `businessDate`, que es lo que hace falta para reproducir una sesión huérfana
 * sin depender del reloj del test.
 */
export async function seedCashRegisterSession(
  context: TestDatabase,
  params: {
    cashRegisterID: string;
    openedByUserID: string;
    businessDate: string;
    openingBalance?: number;
    status?: string;
  },
): Promise<string> {
  const sessionID = randomUUID();

  await context.owner.query(
    `INSERT INTO "CashRegisterSession"
       ("sessionID", "tenantID", "cashRegisterID", "businessDate", "openedByUserID",
        "openedAt", "openingBalance", "status")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      sessionID,
      context.tenantID,
      params.cashRegisterID,
      params.businessDate,
      params.openedByUserID,
      new Date(),
      params.openingBalance ?? 50000,
      params.status ?? 'OPEN',
    ],
  );

  return sessionID;
}

export async function findSessionStatus(
  context: TestDatabase,
  sessionID: string,
): Promise<Record<string, unknown> | undefined> {
  const rows = (await context.owner.query(
    `SELECT "status", "expectedCashBalance", "countedCashBalance", "cashDifference",
            "closedByUserID", "closedAt", "closingNotes"
       FROM "CashRegisterSession" WHERE "sessionID" = $1`,
    [sessionID],
  )) as unknown as Array<Record<string, unknown>>;

  return rows[0];
}

/**
 * Inserta una transferencia de fondos en curso sobre la sesión origen. Se usa
 * para verificar que una sesión con traslados sin resolver no puede sellarse ni
 * por la vía normal ni por la forzada.
 *
 * `destinationType = VAULT` evita la FK de caja destino y el `CHECK` de que el
 * destino difiera del origen, que es lo que pide este escenario.
 */
export async function seedPendingCashTransfer(
  context: TestDatabase,
  params: {
    storeID: string;
    cashRegisterID: string;
    sourceSessionID: string;
    requestedByUserID: string;
  },
): Promise<string> {
  const cashTransferID = randomUUID();

  await context.owner.query(
    `INSERT INTO "CashTransfer"
       ("cashTransferID", "tenantID", "storeID", "sourceCashRegisterID", "sourceSessionID",
        "destinationType", "amount", "status", "requestedByUserID", "requestedAt", "notes")
     VALUES ($1, $2, $3, $4, $5, 'VAULT', 10000, 'PENDING', $6, now(), 'Prueba de integración')`,
    [
      cashTransferID,
      context.tenantID,
      params.storeID,
      params.cashRegisterID,
      params.sourceSessionID,
      params.requestedByUserID,
    ],
  );

  return cashTransferID;
}
