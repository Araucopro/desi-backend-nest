/**
 * Test de integración contra PostgreSQL real.
 *
 * No es un test unitario: la carrera de `openSession` **no se puede reproducir**
 * con repositorios mockeados, porque el invariante lo sostiene el índice único
 * parcial `IDX_unique_open_session_per_register` de la base de datos.
 *
 * La configuración vive en `src/test/.env.test` y el servicio `db` de
 * `docker-compose.yml` (ver `src/test/README.md`).
 *
 * El módulo de test se arma **explícitamente**, sin `overrideProvider`: se
 * registran los tokens que el servicio declara y se inyecta el `DataSource` del
 * arnés como `useValue`. Sobreescribir el provider de `DatabaseModule` resultó
 * frágil (el token `EntityManager` se resuelve dentro de `TypeOrmCoreModule` y
 * no hereda el reemplazo de forma confiable), y un `DataSource` mal inyectado
 * solo se manifiesta más tarde como un error de conexión sin contexto.
 */
import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CashRegistersService } from '../../cash-registers/cash-registers.service';
import {
  CashRegisterSession,
  CashRegisterSessionStatus,
} from '../../cash-registers/entities/cash-register-session.entity';
import { CashRegister } from '../../cash-registers/entities/cash-register.entity';
import { Store } from '../../stores/entities/store.entity';
import { TenantContextService } from '../../multitenant/tenant-context.service';
import { UserRole } from '../../users/entities/user.entity';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import {
  buildAppDataSource,
  countSessions,
  enableCashRls,
  findStoreIDOfRegister,
  prepareTestDatabase,
  seedCashRegister,
  seedStore,
  seedUserWithStore,
  teardownTestDatabase,
  TestDatabase,
} from './database.util';

const BUSINESS_DATE = '2026-09-13';

describe('Apertura de caja (integración)', () => {
  let context: TestDatabase;
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let tenantContext: TenantContextService;
  let service: CashRegistersService;

  const buildUser = (userID: string, role = UserRole.STORE_MANAGER) =>
    ({
      type: 'tenant',
      userId: userID,
      id: userID,
      tenantId: context.tenantID,
      sessionVersion: 1,
      email: `${userID.slice(0, 8)}@test.local`,
      role,
    }) as JwtPayload;

  /**
   * Ejecuta el servicio como lo haría una request real: con contexto tenant
   * activo, que es de donde sale el `tenantID` de la transacción.
   */
  const asRequest = <T>(callback: () => Promise<T>): Promise<T> =>
    tenantContext.run(
      { tenantId: context.tenantID, impersonating: false },
      callback,
    );

  const openSessionOn = (cashRegisterID: string, userID: string) =>
    service.openSession(
      cashRegisterID,
      { businessDate: BUSINESS_DATE, openingBalance: 50000 },
      buildUser(userID),
    );

  /**
   * Crea tienda + usuario con asignación vigente + caja: el escenario mínimo
   * para poder abrir. Devuelve ambos IDs porque el `userID` lo genera el seed
   * (la FK `UserStore.userID → Users.userID` obliga a que exista).
   */
  const seedRegisterWithAccess = async (
    label: string,
  ): Promise<{ cashRegisterID: string; userID: string }> => {
    const storeID = await seedStore(context, { name: `Tienda ${label}` });
    const userID = await seedUserWithStore(context, { storeID });
    const cashRegisterID = await seedCashRegister(context, {
      storeID,
      code: label,
    });

    return { cashRegisterID, userID };
  };

  beforeAll(async () => {
    context = await prepareTestDatabase();

    // El `DataSource` se inicializa aparte para poder dimensionar el pool por
    // encima del default de TypeORM (10): cada apertura concurrente toma dos
    // conexiones (la transacción y la lectura de `UserStore`).
    dataSource = buildAppDataSource();
    await dataSource.initialize();

    // El `pg.Pool` es perezoso: `initialize()` no abre ninguna conexión, así que
    // un destino inválido no falla hasta el primer query real y ahí el error
    // pierde el contexto. Este SELECT fuerza la conexión en el setup.
    await dataSource.query('SELECT 1');

    moduleRef = await Test.createTestingModule({
      providers: [
        CashRegistersService,
        {
          provide: getRepositoryToken(CashRegister),
          useValue: dataSource.getRepository(CashRegister),
        },
        {
          provide: getRepositoryToken(CashRegisterSession),
          useValue: dataSource.getRepository(CashRegisterSession),
        },
        {
          provide: getRepositoryToken(Store),
          useValue: dataSource.getRepository(Store),
        },
        {
          provide: getDataSourceToken(),
          useValue: dataSource,
        },
        {
          provide: TenantContextService,
          useValue: new TenantContextService(dataSource),
        },
      ],
    }).compile();

    tenantContext = moduleRef.get(TenantContextService);
    service = moduleRef.get(CashRegistersService);
  });

  afterAll(async () => {
    // El `DataSource` lo construye e inicializa el arnés y Nest solo lo consume
    // como `useValue`, así que `moduleRef.close()` no lo destruye: se cierra
    // explícitamente.
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
    await moduleRef?.close();
    await teardownTestDatabase(context);
  });

  describe('concurrencia sobre la misma caja', () => {
    /**
     * Con el lock pesimista de la caja, **todos** los intentos concurrentes
     * deben resolverse de forma idempotente: el primero inserta y los demás
     * esperan al commit, releen la sesión y la devuelven tal cual. No debe
     * aparecer ningún `409` en este escenario (un `409` aquí sería legítimo para
     * el invariante, pero significaría que el lock no está serializando).
     */
    it('N=10 aperturas simultáneas dejan exactamente 1 sesión y ningún error', async () => {
      const { cashRegisterID, userID } = await seedRegisterWithAccess('CONC-1');

      const attempts = 10;
      const settled = await Promise.allSettled(
        Array.from({ length: attempts }, () =>
          asRequest(() => openSessionOn(cashRegisterID, userID)),
        ),
      );

      const rejected = settled.filter(
        (result): result is PromiseRejectedResult =>
          result.status === 'rejected',
      );

      // Ningún intento puede terminar en un error: ni un 500 no controlado ni un
      // 409 por choque contra el índice único.
      expect(
        rejected.map(
          (result) => `${(result.reason as Error).name}: ${result.reason}`,
        ),
      ).toEqual([]);

      // Los 10 reciben la misma sesión: el reintento es idempotente.
      const sessionIDs = settled.map((result) =>
        result.status === 'fulfilled' ? result.value.sessionID : null,
      );
      expect(sessionIDs.every((sessionID) => sessionID !== null)).toBe(true);
      expect(new Set(sessionIDs).size).toBe(1);

      // El invariante real del sistema, verificado en la base.
      await expect(countSessions(context, cashRegisterID)).resolves.toBe(1);
    });

    it('aperturas simultáneas en cajas distintas del mismo tenant no se bloquean entre sí', async () => {
      const registros = [
        await seedRegisterWithAccess('CONC-2A'),
        await seedRegisterWithAccess('CONC-2B'),
        await seedRegisterWithAccess('CONC-2C'),
      ];

      const settled = await Promise.allSettled(
        registros.flatMap(({ cashRegisterID, userID }) => [
          asRequest(() => openSessionOn(cashRegisterID, userID)),
          asRequest(() => openSessionOn(cashRegisterID, userID)),
        ]),
      );

      const unexpected = settled.filter(
        (result) =>
          result.status === 'rejected' &&
          !(result.reason instanceof ConflictException),
      );
      expect(unexpected).toEqual([]);

      for (const { cashRegisterID } of registros) {
        await expect(countSessions(context, cashRegisterID)).resolves.toBe(1);
      }
    });
  });

  describe('sesión previa y reapertura', () => {
    it('un conflicto con otro cajero responde 409 incluyendo el sessionID existente', async () => {
      const { cashRegisterID, userID: ownerUserID } =
        await seedRegisterWithAccess('CONF-1');
      // Un segundo cajero con acceso a la **misma** tienda: así el único motivo
      // del rechazo es la sesión abierta, no la falta de permiso.
      const otherUserID = await seedUserWithStore(context, {
        storeID: await findStoreIDOfRegister(context, cashRegisterID),
      });

      const existing = await asRequest(() =>
        openSessionOn(cashRegisterID, ownerUserID),
      );

      const error = await asRequest(() =>
        openSessionOn(cashRegisterID, otherUserID),
      ).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).message).toContain(
        existing.sessionID,
      );
    });

    it('el reintento del mismo cajero y la misma fecha es idempotente', async () => {
      const { cashRegisterID, userID } = await seedRegisterWithAccess('IDEM-1');

      const first = await asRequest(() =>
        openSessionOn(cashRegisterID, userID),
      );
      const second = await asRequest(() =>
        openSessionOn(cashRegisterID, userID),
      );

      expect(second.sessionID).toBe(first.sessionID);
      await expect(countSessions(context, cashRegisterID)).resolves.toBe(1);
    });

    it('el mismo cajero con otra fecha contable recibe 409', async () => {
      const { cashRegisterID, userID } = await seedRegisterWithAccess('IDEM-2');

      await asRequest(() => openSessionOn(cashRegisterID, userID));

      await expect(
        asRequest(() =>
          service.openSession(
            cashRegisterID,
            { businessDate: '2026-09-12', openingBalance: 50000 },
            buildUser(userID),
          ),
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('cerrar la sesión directa permite reabrir la misma caja', async () => {
      const { cashRegisterID, userID } =
        await seedRegisterWithAccess('REOPEN-1');

      const opened = await asRequest(() =>
        openSessionOn(cashRegisterID, userID),
      );

      const closed = await asRequest(() =>
        service.closeSession(
          cashRegisterID,
          { countedCashBalance: 50000 },
          buildUser(userID),
        ),
      );
      expect(closed.status).toBe(CashRegisterSessionStatus.CLOSED);

      const reopened = await asRequest(() =>
        openSessionOn(cashRegisterID, userID),
      );

      expect(reopened.sessionID).not.toBe(opened.sessionID);
      await expect(countSessions(context, cashRegisterID)).resolves.toBe(2);
    });
  });

  /**
   * Con RLS forzado, resolver el acceso del usuario con el repositorio global
   * (otra conexión, sin `app.tenant_id`) devolvería 0 filas y un 403 falso.
   * Este bloque ejecuta el escenario real: las tablas quedan con
   * `FORCE ROW LEVEL SECURITY`, así que la app —que conecta como **dueño**— deja
   * de estar exenta de las políticas y se comporta como el rol runtime de
   * producción.
   */
  describe('aislamiento por tenant (RLS)', () => {
    let rlsContext: TestDatabase;
    let rlsDataSource: DataSource;
    let rlsService: CashRegistersService;

    beforeAll(async () => {
      // Esquema limpio y políticas aplicadas; el bloque anterior ya terminó.
      rlsContext = await prepareTestDatabase();
      await enableCashRls(rlsContext);

      rlsDataSource = buildAppDataSource();
      await rlsDataSource.initialize();
      await rlsDataSource.query('SELECT 1');

      // Se construye el servicio directamente para que su
      // `TenantContextService` use esta conexión.
      rlsService = new CashRegistersService(
        rlsDataSource.getRepository(CashRegister),
        rlsDataSource.getRepository(CashRegisterSession),
        rlsDataSource.getRepository(Store),
        new TenantContextService(rlsDataSource),
      );
    });

    afterAll(async () => {
      if (rlsDataSource?.isInitialized) {
        await rlsDataSource.destroy();
      }
      await teardownTestDatabase(rlsContext);
    });

    it('la validación de acceso a tienda corre en la conexión de la transacción', async () => {
      const storeID = await seedStore(rlsContext, { name: 'Tienda RLS' });
      const userID = await seedUserWithStore(rlsContext, { storeID });
      const cashRegisterID = await seedCashRegister(rlsContext, {
        storeID,
        code: 'RLS-1',
      });

      const user = {
        type: 'tenant',
        userId: userID,
        id: userID,
        tenantId: rlsContext.tenantID,
        sessionVersion: 1,
        email: 'rls@test.local',
        role: UserRole.STORE_MANAGER,
      } as JwtPayload;

      const rlsTenantContext = new TenantContextService(rlsDataSource);
      const session = await rlsTenantContext.run(
        { tenantId: rlsContext.tenantID, impersonating: false },
        () =>
          rlsService.openSession(
            cashRegisterID,
            { businessDate: BUSINESS_DATE, openingBalance: 50000 },
            user,
          ),
      );

      expect(session.status).toBe(CashRegisterSessionStatus.OPEN);
      expect(session.tenantID).toBe(rlsContext.tenantID);
    });
  });
});
