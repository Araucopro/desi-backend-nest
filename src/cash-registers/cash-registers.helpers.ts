import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  DeepPartial,
  EntityManager,
  FindOptionsWhere,
  In,
  IsNull,
} from 'typeorm';
import { isUniqueViolation } from '../common/utils/db-errors.util';
import {
  JwtPayload,
  MasterJwtPayload,
} from '../auth/interfaces/jwt-payload.interface';
import { UserStore } from '../relations/userstores/entities/userstore.entity';
import { Store } from '../stores/entities/store.entity';
import { UserRole } from '../users/entities/user.entity';
import { CashPaymentMethodTotal } from './entities/cash-register-closing.entity';
import {
  CashRegisterSessionUser,
  CashRegisterSessionUserRole,
} from './entities/cash-register-session-user.entity';
import {
  CASH_TRANSFER_OPEN_STATUSES,
  CashTransfer,
  CashTransferDestinationType,
  CashTransferStatus,
} from './entities/cash-transfer.entity';
import {
  CashMovement,
  CashMovementStatus,
  CashMovementType,
} from './entities/cash-movement.entity';
import { CashRegister } from './entities/cash-register.entity';
import {
  CashRegisterSession,
  CashRegisterSessionStatus,
} from './entities/cash-register-session.entity';
import { Payment, PaymentStatus } from './entities/payment.entity';
import { PaymentMethod } from './entities/payment-method.entity';

export function toMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Encabezado con el que se marca una sesión cerrada por la vía forzada. El
 * prefijo es estable a propósito: permite distinguir en una consulta SQL los
 * cierres sin arqueo de los cierres normales, algo que un texto libre no permite.
 */
export const FORCE_CLOSE_NOTE_PREFIX = '[CIERRE FORZADO]';

/**
 * Compone la nota de cierre forzado. La marca de tiempo va dentro de la nota
 * porque `CashRegisterSession` no tiene una columna `forceClosedAt` y no vale la
 * pena una migración de esquema solo para esto: `closingNotes` ya es el campo de
 * auditoría del cierre y `closedAt` guarda el instante exacto.
 */
export function buildForceCloseNote(
  reason: string,
  now: Date = new Date(),
): string {
  return `${FORCE_CLOSE_NOTE_PREFIX} ${now.toISOString()} — ${reason}`;
}

export function resolveActingUserId(
  user: JwtPayload | MasterJwtPayload,
): string {
  return user.type === 'master'
    ? (user as MasterJwtPayload).masterUserId
    : user.userId || user.id;
}

/**
 * Roles con facultad de aprobación dentro de caja: registrar movimientos con
 * `requiresApproval = true` y rechazar un arqueo en curso. Los tokens MASTER
 * impersonando un tenant actúan como supervisores.
 */
export const CASH_APPROVAL_ROLES: readonly UserRole[] = [
  UserRole.ADMIN,
  UserRole.STORE_MANAGER,
];

export function isCashApprover(user: JwtPayload | MasterJwtPayload): boolean {
  if (user.type === 'master') return true;

  return CASH_APPROVAL_ROLES.includes(user.role);
}

export function assertCashApprover(
  user: JwtPayload | MasterJwtPayload,
  message: string,
): void {
  if (!isCashApprover(user)) {
    throw new ForbiddenException(message);
  }
}

/**
 * Valida que el usuario pueda operar sobre la tienda de la caja. Usuarios
 * MASTER y ADMIN del tenant acceden siempre; el resto requiere `UserStore`.
 *
 * La lectura de `UserStore` se hace **con el `EntityManager` recibido**: así
 * corre en la conexión de la transacción en curso, con `app.tenant_id` ya
 * aplicado. Resolverlo con el repositorio global abriría una segunda conexión
 * del pool sin contexto tenant, y con RLS forzado sobre `UserStore` la consulta
 * devolvería 0 filas: el usuario recibiría un 403 intermitente.
 */
export async function assertUserCanAccessStore(
  manager: EntityManager,
  user: JwtPayload | MasterJwtPayload,
  storeID: string,
): Promise<void> {
  if (user.type === 'master') return;

  const tenantUser = user;
  if (tenantUser.role === UserRole.ADMIN) return;

  const userID = tenantUser.userId || tenantUser.id;

  const userStore = await manager
    .getRepository(UserStore)
    .createQueryBuilder('userStore')
    .where('userStore.userID = :userID', { userID })
    .andWhere('userStore.storeID = :storeID', { storeID })
    .andWhere('userStore.effectiveTo IS NULL')
    .andWhere('userStore.removedAt IS NULL')
    .getOne();

  if (!userStore) {
    throw new ForbiddenException(
      'El usuario no tiene asignada la tienda correspondiente a esta caja',
    );
  }
}

export async function findCashRegisterOrFail(
  manager: EntityManager,
  cashRegisterID: string,
  tenantID?: string,
): Promise<CashRegister> {
  const where: FindOptionsWhere<CashRegister> = { cashRegisterID };
  if (tenantID) where.tenantID = tenantID;

  const register = await manager.getRepository(CashRegister).findOne({ where });

  if (!register) {
    throw new NotFoundException(`Caja con ID ${cashRegisterID} no encontrada`);
  }

  return register;
}

export async function findSessionOrFail(
  manager: EntityManager,
  sessionID: string,
  cashRegisterID: string,
  tenantID?: string,
): Promise<CashRegisterSession> {
  const where: FindOptionsWhere<CashRegisterSession> = {
    sessionID,
    cashRegisterID,
  };
  if (tenantID) where.tenantID = tenantID;

  const session = await manager
    .getRepository(CashRegisterSession)
    .findOne({ where });

  if (!session) {
    throw new NotFoundException(
      `Sesión con ID ${sessionID} no encontrada para la caja ${cashRegisterID}`,
    );
  }

  return session;
}

/**
 * Obtiene la sesión `OPEN` de una caja. Con `lock` toma `FOR UPDATE`, lo que
 * serializa cobros, movimientos y cierre sobre la misma sesión.
 */
export async function findOpenSessionOrFail(
  manager: EntityManager,
  cashRegisterID: string,
  options: { tenantID?: string; lock?: boolean } = {},
): Promise<CashRegisterSession> {
  const where: FindOptionsWhere<CashRegisterSession> = {
    cashRegisterID,
    status: CashRegisterSessionStatus.OPEN,
  };
  if (options.tenantID) where.tenantID = options.tenantID;

  const session = await manager.getRepository(CashRegisterSession).findOne({
    where,
    ...(options.lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
  });

  if (!session) {
    throw new BadRequestException(
      `La caja con ID ${cashRegisterID} no tiene una sesión abierta (OPEN)`,
    );
  }

  return session;
}

export type SessionCashTotals = {
  cashIn: number;
  cashOut: number;
  net: number;
  movementCount: number;
};

/**
 * Suma los movimientos `POSTED` de una sesión: las anulaciones se compensan
 * con su contra-movimiento, por lo que el saldo esperado siempre se deriva de
 * movimientos vigentes. Devuelve además el conteo de movimientos, usado como
 * fotografía en el arqueo de cierre.
 */
export async function sumSessionCashMovements(
  manager: EntityManager,
  sessionID: string,
): Promise<SessionCashTotals> {
  const raw = await manager
    .getRepository(CashMovement)
    .createQueryBuilder('movement')
    .select(
      `COALESCE(SUM(CASE WHEN movement.type = :cashIn THEN movement.amount ELSE -movement.amount END), 0)`,
      'net',
    )
    .addSelect(
      `COALESCE(SUM(CASE WHEN movement.type = :cashIn THEN movement.amount ELSE 0 END), 0)`,
      'cashIn',
    )
    .addSelect(
      `COALESCE(SUM(CASE WHEN movement.type = :cashOut THEN movement.amount ELSE 0 END), 0)`,
      'cashOut',
    )
    .addSelect(`COUNT(*)`, 'movementCount')
    .where('movement.sessionID = :sessionID', { sessionID })
    .andWhere('movement.status = :posted', {
      posted: CashMovementStatus.POSTED,
    })
    .setParameters({
      cashIn: CashMovementType.CASH_IN,
      cashOut: CashMovementType.CASH_OUT,
    })
    .getRawOne<{
      net: string;
      cashIn: string;
      cashOut: string;
      movementCount: string;
    }>();

  const cashIn = toMoney(Number(raw?.cashIn ?? 0));
  const cashOut = toMoney(Number(raw?.cashOut ?? 0));

  return {
    cashIn,
    cashOut,
    net: toMoney(cashIn - cashOut),
    movementCount: Number(raw?.movementCount ?? 0),
  };
}

/**
 * Registra a un usuario como operador activo de la sesión (Hito 4). Se usa al
 * abrir la sesión para dejar trazabilidad inmediata de quién atiende la caja;
 * si el operador ya tiene un registro activo se devuelve el existente para
 * mantener la operación idempotente.
 *
 * **Contrato de atomicidad:** esta función corre dentro de la transacción de
 * `openSession`, justo después de guardar la sesión. Si falla, la transacción
 * completa revierte y **la apertura no queda persistida**: no puede existir una
 * sesión `OPEN` sin su operador en turno. El llamador no debe intentar compensar
 * ni reintentar por su cuenta — la sesión simplemente no se creó.
 */
export async function attachSessionOperator(
  manager: EntityManager,
  params: {
    tenantID: string;
    sessionID: string;
    userID: string;
    assignedByUserID: string;
    enteredAt: Date;
    role?: CashRegisterSessionUserRole;
    notes?: string | null;
  },
): Promise<CashRegisterSessionUser> {
  const repository = manager.getRepository(CashRegisterSessionUser);

  const existing = await repository.findOne({
    where: {
      tenantID: params.tenantID,
      sessionID: params.sessionID,
      userID: params.userID,
      leftAt: IsNull(),
    },
  });
  if (existing) return existing;

  return repository.save(
    repository.create({
      tenantID: params.tenantID,
      sessionID: params.sessionID,
      userID: params.userID,
      assignedByUserID: params.assignedByUserID,
      role: params.role ?? CashRegisterSessionUserRole.OPERATOR,
      enteredAt: params.enteredAt,
      leftAt: null,
      notes: params.notes ?? null,
    }),
  );
}

/**
 * Cierra el turno de todos los operadores activos de la sesión (Hito 4). Se
 * invoca al sellar la sesión (`CLOSED`) para que ninguna sesión cerrada quede
 * con operadores marcados como "en turno".
 */
export async function closeSessionOperators(
  manager: EntityManager,
  sessionID: string,
  leftAt: Date,
): Promise<void> {
  await manager
    .getRepository(CashRegisterSessionUser)
    .createQueryBuilder()
    .update(CashRegisterSessionUser)
    .set({ leftAt, updatedAt: new Date() })
    .where('"sessionID" = :sessionID', { sessionID })
    .andWhere('"leftAt" IS NULL')
    .execute();
}

export async function findStoreOrFail(
  manager: EntityManager,
  storeID: string,
  tenantID?: string,
): Promise<Store> {
  const where: FindOptionsWhere<Store> = { storeID };
  if (tenantID) where.tenantID = tenantID;

  const store = await manager.getRepository(Store).findOne({ where });

  if (!store) {
    throw new NotFoundException(`Tienda con ID ${storeID} no encontrada`);
  }

  return store;
}

/**
 * Guarda una entidad recién creada traduciendo la violación de unicidad
 * (`23505`) a un `409`. Existe porque el patrón `create` + `save` + `catch` con
 * un mensaje de dominio se repite en casi todos los servicios de caja, y en cada
 * copia es fácil olvidar el `throw error` final y convertir un `23505` no
 * relacionado —o un error de conexión— en un `409` con la causa equivocada.
 *
 * **Contrato:** solo traduce `23505`. Cualquier otro error se propaga intacto,
 * porque la causa real (permisos, RLS, tipo de dato, FK) tiene otro diagnóstico y
 * otro código HTTP. El llamador decide el mensaje de conflicto, que es lo único
 * realmente específico del dominio.
 *
 * Uso:
 * ```ts
 * return saveOrConflict(
 *   repository,
 *   repository.create({ tenantID, code }),
 *   `Ya existe un medio de pago con el código "${code}"`,
 * );
 * ```
 *
 * Cuando el mensaje depende del índice violado (por ejemplo el de sesión abierta
 * comparte `23505` con el de operador activo), usar `resolveDbConstraint` antes
 * de llamar aquí y no delegar la distinción a este helper.
 */
export async function saveOrConflict<T extends object>(
  repository: { save: (entity: DeepPartial<T>) => Promise<T> },
  entity: DeepPartial<T>,
  conflictMessage: string,
): Promise<T> {
  try {
    return await repository.save(entity);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictException(conflictMessage);
    }
    throw error;
  }
}

/**
 * Suma los cobros `COMPLETED` de una sesión agrupados por medio de pago.
 * Alimenta la fotografía de arqueo (Hito 3) y los reportes analíticos de caja
 * (Hito 5), de modo que la conciliación y el reporte usan exactamente el mismo
 * criterio contable.
 */
export async function sumSessionPaymentsByMethod(
  manager: EntityManager,
  sessionID: string,
): Promise<CashPaymentMethodTotal[]> {
  const rows = await manager
    .getRepository(Payment)
    .createQueryBuilder('payment')
    .innerJoin(
      PaymentMethod,
      'method',
      'method.paymentMethodID = payment.paymentMethodID',
    )
    .select('payment.paymentMethodID', 'paymentMethodID')
    .addSelect('method.code', 'code')
    .addSelect('method.name', 'name')
    .addSelect('method.affectsCash', 'affectsCash')
    .addSelect('COUNT(*)', 'paymentCount')
    .addSelect('COALESCE(SUM(payment.amount), 0)', 'amount')
    .where('payment.sessionID = :sessionID', { sessionID })
    .andWhere('payment.status = :status', {
      status: PaymentStatus.COMPLETED,
    })
    .groupBy('payment.paymentMethodID')
    .addGroupBy('method.code')
    .addGroupBy('method.name')
    .addGroupBy('method.affectsCash')
    .orderBy('method.code', 'ASC')
    .getRawMany<{
      paymentMethodID: string;
      code: string;
      name: string;
      affectsCash: boolean | string;
      paymentCount: string;
      amount: string;
    }>();

  return rows.map((row) => ({
    paymentMethodID: row.paymentMethodID,
    code: row.code,
    name: row.name,
    affectsCash: row.affectsCash === true || row.affectsCash === 'true',
    paymentCount: Number(row.paymentCount ?? 0),
    amount: toMoney(Number(row.amount ?? 0)),
  }));
}

export type SessionTransferTotals = {
  /** Efectivo ya enviado desde la sesión (transferencias `COMPLETED`). */
  outCount: number;
  outAmount: number;
  toRegisterCount: number;
  toRegisterAmount: number;
  toVaultCount: number;
  toVaultAmount: number;
  /** Efectivo recibido en la sesión desde otra caja (`COMPLETED`). */
  inCount: number;
  inAmount: number;
  /** Transferencias solicitadas o aprobadas que aún no mueven efectivo. */
  pendingCount: number;
  pendingAmount: number;
};

/**
 * Totales de transferencias de fondos que tocan una sesión: salidas y entradas
 * `COMPLETED` (efectivo ya movido) y solicitudes abiertas (`PENDING` /
 * `APPROVED`) que todavía no afectan el saldo esperado de la caja.
 */
export async function sumSessionTransferTotals(
  manager: EntityManager,
  params: { tenantID: string; sessionID: string },
): Promise<SessionTransferTotals> {
  const { tenantID, sessionID } = params;

  const raw = await manager
    .getRepository(CashTransfer)
    .createQueryBuilder('transfer')
    .select(
      `COALESCE(SUM(CASE WHEN transfer.sourceSessionID = :sessionID AND transfer.status = :completed THEN 1 ELSE 0 END), 0)`,
      'outCount',
    )
    .addSelect(
      `COALESCE(SUM(CASE WHEN transfer.sourceSessionID = :sessionID AND transfer.status = :completed THEN transfer.amount ELSE 0 END), 0)`,
      'outAmount',
    )
    .addSelect(
      `COALESCE(SUM(CASE WHEN transfer.sourceSessionID = :sessionID AND transfer.status = :completed AND transfer.destinationType = :toRegister THEN 1 ELSE 0 END), 0)`,
      'toRegisterCount',
    )
    .addSelect(
      `COALESCE(SUM(CASE WHEN transfer.sourceSessionID = :sessionID AND transfer.status = :completed AND transfer.destinationType = :toRegister THEN transfer.amount ELSE 0 END), 0)`,
      'toRegisterAmount',
    )
    .addSelect(
      `COALESCE(SUM(CASE WHEN transfer.sourceSessionID = :sessionID AND transfer.status = :completed AND transfer.destinationType = :toVault THEN 1 ELSE 0 END), 0)`,
      'toVaultCount',
    )
    .addSelect(
      `COALESCE(SUM(CASE WHEN transfer.sourceSessionID = :sessionID AND transfer.status = :completed AND transfer.destinationType = :toVault THEN transfer.amount ELSE 0 END), 0)`,
      'toVaultAmount',
    )
    .addSelect(
      `COALESCE(SUM(CASE WHEN transfer.destinationSessionID = :sessionID AND transfer.status = :completed THEN 1 ELSE 0 END), 0)`,
      'inCount',
    )
    .addSelect(
      `COALESCE(SUM(CASE WHEN transfer.destinationSessionID = :sessionID AND transfer.status = :completed THEN transfer.amount ELSE 0 END), 0)`,
      'inAmount',
    )
    .addSelect(
      `COALESCE(SUM(CASE WHEN transfer.sourceSessionID = :sessionID AND transfer.status IN (:...openStatuses) THEN 1 ELSE 0 END), 0)`,
      'pendingCount',
    )
    .addSelect(
      `COALESCE(SUM(CASE WHEN transfer.sourceSessionID = :sessionID AND transfer.status IN (:...openStatuses) THEN transfer.amount ELSE 0 END), 0)`,
      'pendingAmount',
    )
    .where('transfer.tenantID = :tenantID', { tenantID })
    .andWhere(
      '(transfer.sourceSessionID = :sessionID OR transfer.destinationSessionID = :sessionID)',
      { sessionID },
    )
    .setParameters({
      completed: CashTransferStatus.COMPLETED,
      toRegister: CashTransferDestinationType.CASH_REGISTER,
      toVault: CashTransferDestinationType.VAULT,
      openStatuses: [...CASH_TRANSFER_OPEN_STATUSES],
    })
    .getRawOne<Record<string, string | number | null>>();

  const numberFrom = (key: string): number => Number(raw?.[key] ?? 0);
  const moneyFrom = (key: string): number => toMoney(numberFrom(key));

  return {
    outCount: numberFrom('outCount'),
    outAmount: moneyFrom('outAmount'),
    toRegisterCount: numberFrom('toRegisterCount'),
    toRegisterAmount: moneyFrom('toRegisterAmount'),
    toVaultCount: numberFrom('toVaultCount'),
    toVaultAmount: moneyFrom('toVaultAmount'),
    inCount: numberFrom('inCount'),
    inAmount: moneyFrom('inAmount'),
    pendingCount: numberFrom('pendingCount'),
    pendingAmount: moneyFrom('pendingAmount'),
  };
}

/**
 * Cuenta las transferencias solicitadas o aprobadas que aún no mueven efectivo
 * sobre una sesión. Se usa al sellar la sesión: una caja no puede cerrarse con
 * traslados en curso, porque ya no podrían ejecutarse (Regla 2: hermetismo
 * post-cierre).
 */
export async function countOpenSessionTransfers(
  manager: EntityManager,
  tenantID: string,
  sessionID: string,
): Promise<number> {
  return manager.getRepository(CashTransfer).count({
    where: {
      tenantID,
      sourceSessionID: sessionID,
      status: In([...CASH_TRANSFER_OPEN_STATUSES]),
    },
  });
}

/**
 * Efectivo esperado disponible en una sesión: fondo inicial más movimientos
 * `POSTED`. Es el techo físico para cualquier salida de efectivo (transferencia
 * o retiro), porque una caja no puede entregar más de lo que tiene.
 */
export async function resolveSessionExpectedCash(
  manager: EntityManager,
  session: CashRegisterSession,
): Promise<number> {
  const totals = await sumSessionCashMovements(manager, session.sessionID);

  return toMoney(Number(session.openingBalance ?? 0) + totals.net);
}
