import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';

/**
 * Índice que sostiene el invariante "una sola sesión `OPEN` por caja y tenant".
 * Es la única barrera real contra dos sesiones simultáneas sobre la misma caja:
 * `openSession` lee la sesión activa y luego inserta, y el `catch` de `23505` es
 * la garantía final.
 */
export const SINGLE_OPEN_SESSION_INDEX = 'IDX_unique_open_session_per_register';

/** Tabla sobre la que vive el índice. */
export const SINGLE_OPEN_SESSION_TABLE = 'CashRegisterSession';

/**
 * Predicado que debe tener el índice para seguir siendo parcial. PostgreSQL
 * normaliza el `WHERE` a algo como `WHERE ((status = 'OPEN'::text))`, así que la
 * comprobación tolera el `::text`, comillas en el nombre de columna y la
 * diferencia entre `status` y `"status"`.
 */
const EXPECTED_PREDICATE = /"?status"?\s*=\s*'OPEN'(::text)?/i;

export type SchemaIndexState = {
  exists: boolean;
  isUnique: boolean;
  isPartial: boolean;
  definition?: string;
};

/**
 * Verifica al arranque que el índice único parcial de sesión abierta exista y
 * conserve sus tres propiedades (existencia, unicidad y parcialidad).
 *
 * **Por qué abortar el arranque en vez de solo loggear:** sin ese índice no hay
 * invariante. El sistema seguiría respondiendo `200` y crearía dos sesiones
 * `OPEN` sobre la misma caja, con dos arqueos calculando saldos sobre la misma
 * gaveta. Es preferible un arranque fallido y visible a una corrupción
 * silenciosa.
 *
 * La verificación es una consulta a `pg_index` con el catálogo del esquema
 * activo, no una lectura de entidades: se pregunta por el objeto real de la
 * base, que es lo que se quiere comprobar.
 */
@Injectable()
export class CashRegisterSchemaGuardService implements OnModuleInit {
  private readonly logger = new Logger(CashRegisterSchemaGuardService.name);

  constructor(private readonly dataSource: DataSource) {}

  async onModuleInit(): Promise<void> {
    const state = await this.inspectSingleOpenSessionIndex();

    if (!this.isValid(state)) {
      throw new Error(this.buildFailureMessage(state));
    }

    this.logger.log(
      `Invariante de caja verificado: ${SINGLE_OPEN_SESSION_INDEX} es UNIQUE y parcial (WHERE status = 'OPEN')`,
    );
  }

  /**
   * Consulta el estado del índice en el catálogo del esquema. Devuelve
   * `exists: false` cuando no está, en vez de lanzar, para que el llamador pueda
   * decidir el mensaje.
   */
  async inspectSingleOpenSessionIndex(): Promise<SchemaIndexState> {
    const rows = (await this.dataSource.query(
      `SELECT
         index_definition.indisunique AS "isUnique",
         index_definition.indpred IS NOT NULL AS "isPartial",
         pg_get_indexdef(index_definition.indexrelid) AS "definition"
       FROM pg_index AS index_definition
       JOIN pg_class AS index_relation
         ON index_relation.oid = index_definition.indexrelid
       JOIN pg_class AS table_relation
         ON table_relation.oid = index_definition.indrelid
       JOIN pg_namespace AS table_schema
         ON table_schema.oid = table_relation.relnamespace
       WHERE index_relation.relname = $1
         AND table_relation.relname = $2
         AND table_schema.nspname = ANY (current_schemas(false))`,
      [SINGLE_OPEN_SESSION_INDEX, SINGLE_OPEN_SESSION_TABLE],
    )) as unknown as Array<{
      isUnique: boolean;
      isPartial: boolean;
      definition: string;
    }>;

    const row = rows[0];
    if (!row) {
      return { exists: false, isUnique: false, isPartial: false };
    }

    return {
      exists: true,
      isUnique: row.isUnique,
      isPartial: row.isPartial && EXPECTED_PREDICATE.test(row.definition ?? ''),
      definition: row.definition,
    };
  }

  private isValid(state: SchemaIndexState): boolean {
    return state.exists && state.isUnique && state.isPartial;
  }

  private buildFailureMessage(state: SchemaIndexState): string {
    const cause = !state.exists
      ? 'no existe en la base de datos'
      : !state.isUnique
        ? 'existe pero no es UNIQUE'
        : "existe pero no es parcial o su predicado no es `status = 'OPEN'`";

    return [
      `Invariante de caja roto: el índice "${SINGLE_OPEN_SESSION_INDEX}" sobre "${SINGLE_OPEN_SESSION_TABLE}" ${cause}.`,
      'Sin ese índice nada impide que una misma caja tenga dos sesiones OPEN simultáneas.',
      `Definición esperada: CREATE UNIQUE INDEX "${SINGLE_OPEN_SESSION_INDEX}" ON "${SINGLE_OPEN_SESSION_TABLE}" ("tenantID", "cashRegisterID") WHERE status = 'OPEN';`,
      'Aplique las migraciones versionadas (`pnpm build && pnpm migration:run`) antes de levantar el servicio.',
      state.definition ? `Definición encontrada: ${state.definition}` : '',
    ]
      .filter((line) => line.length > 0)
      .join(' ');
  }
}
