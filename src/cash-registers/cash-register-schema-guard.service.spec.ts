import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import {
  CashRegisterSchemaGuardService,
  SINGLE_OPEN_SESSION_INDEX,
} from './cash-register-schema-guard.service';

/**
 * El guard es la red de seguridad de la Fase 3.3: detecta que el índice único
 * parcial de sesión abierta desapareció o perdió propiedades. Como su efecto es
 * **abortar el arranque**, los tres casos de fallo importan tanto como el de
 * éxito: un guard que no falla es peor que no tener guard.
 */
describe('CashRegisterSchemaGuardService (Fase 3.3)', () => {
  let service: CashRegisterSchemaGuardService;
  const query = jest.fn();

  const mockDataSource = { query } as unknown as DataSource;

  /** Fila tal como la devuelve el `SELECT` sobre `pg_index`. */
  const indexRow = (overrides: Record<string, unknown> = {}) => ({
    isUnique: true,
    isPartial: true,
    definition:
      `CREATE UNIQUE INDEX "${SINGLE_OPEN_SESSION_INDEX}" ON public."CashRegisterSession" ` +
      `USING btree ("tenantID", "cashRegisterID") WHERE (status = 'OPEN'::text)`,
    ...overrides,
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CashRegisterSchemaGuardService,
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get(CashRegisterSchemaGuardService);
  });

  it('consulta el catálogo por nombre de índice y tabla, sin asumir el esquema', async () => {
    query.mockResolvedValue([indexRow()]);

    await service.inspectSingleOpenSessionIndex();

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, parameters] = query.mock.calls[0] as [string, unknown[]];
    expect(parameters).toEqual([
      SINGLE_OPEN_SESSION_INDEX,
      'CashRegisterSession',
    ]);
    expect(sql).toContain('pg_index');
    expect(sql).toContain('current_schemas(false)');
    expect(sql).toContain('pg_get_indexdef');
  });

  it('no falla cuando el índice existe, es UNIQUE y es parcial sobre OPEN', async () => {
    query.mockResolvedValue([indexRow()]);

    await expect(service.onModuleInit()).resolves.toBeUndefined();
  });

  it('tolera el predicado normalizado por PostgreSQL (`::text` y paréntesis)', async () => {
    query.mockResolvedValue([
      indexRow({
        definition:
          `CREATE UNIQUE INDEX "${SINGLE_OPEN_SESSION_INDEX}" ON public."CashRegisterSession" ` +
          `USING btree ("tenantID", "cashRegisterID") WHERE ("status" = 'OPEN'::text)`,
      }),
    ]);

    await expect(service.onModuleInit()).resolves.toBeUndefined();
  });

  it('aborta el arranque cuando el índice no existe', async () => {
    query.mockResolvedValue([]);

    await expect(service.onModuleInit()).rejects.toThrow(
      /Invariante de caja roto.*no existe en la base de datos/,
    );
  });

  it('aborta el arranque cuando el índice dejó de ser UNIQUE', async () => {
    query.mockResolvedValue([indexRow({ isUnique: false })]);

    await expect(service.onModuleInit()).rejects.toThrow(
      /existe pero no es UNIQUE/,
    );
  });

  it('aborta el arranque cuando el índice dejó de ser parcial', async () => {
    query.mockResolvedValue([
      indexRow({
        isPartial: false,
        definition: `CREATE UNIQUE INDEX "${SINGLE_OPEN_SESSION_INDEX}" ON public."CashRegisterSession" USING btree ("tenantID", "cashRegisterID")`,
      }),
    ]);

    await expect(service.onModuleInit()).rejects.toThrow(/no es parcial/);
  });

  it('aborta el arranque cuando el predicado ya no filtra por OPEN', async () => {
    query.mockResolvedValue([
      indexRow({
        definition:
          `CREATE UNIQUE INDEX "${SINGLE_OPEN_SESSION_INDEX}" ON public."CashRegisterSession" ` +
          `USING btree ("tenantID", "cashRegisterID") WHERE (status = 'CLOSED'::text)`,
      }),
    ]);

    await expect(service.onModuleInit()).rejects.toThrow(/no es parcial/);
  });

  it('explica la causa, la definición esperada y cómo repararla', async () => {
    query.mockResolvedValue([]);

    const error = await service
      .onModuleInit()
      .catch((caught: unknown) => caught);
    const message = (error as Error).message;

    expect(message).toContain(SINGLE_OPEN_SESSION_INDEX);
    expect(message).toContain('CashRegisterSession');
    expect(message).toContain('dos sesiones OPEN simultáneas');
    expect(message).toContain('CREATE UNIQUE INDEX');
    expect(message).toContain('migration:run');
  });
});
