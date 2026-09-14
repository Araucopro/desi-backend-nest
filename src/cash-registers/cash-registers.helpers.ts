import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager, FindOptionsWhere } from 'typeorm';
import {
  JwtPayload,
  MasterJwtPayload,
} from '../auth/interfaces/jwt-payload.interface';
import { UserstoresService } from '../relations/userstores/userstores.service';
import { UserRole } from '../users/entities/user.entity';
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

export function toMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function resolveActingUserId(
  user: JwtPayload | MasterJwtPayload,
): string {
  return user.type === 'master'
    ? (user as MasterJwtPayload).masterUserId
    : user.userId || user.id;
}

/**
 * Valida que el usuario pueda operar sobre la tienda de la caja. Usuarios
 * MASTER y ADMIN del tenant acceden siempre; el resto requiere `UserStore`.
 */
export async function assertUserCanAccessStore(
  userstoresService: UserstoresService,
  user: JwtPayload | MasterJwtPayload,
  storeID: string,
): Promise<void> {
  if (user.type === 'master') return;

  const tenantUser = user;
  if (tenantUser.role === UserRole.ADMIN) return;

  const assignedStores = await userstoresService.findStoresByUserId(
    tenantUser.userId || tenantUser.id,
  );
  const hasAccess = assignedStores.some(
    (userStore) => userStore.store?.storeID === storeID,
  );

  if (!hasAccess) {
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
};

/**
 * Suma los movimientos `POSTED` de una sesión: las anulaciones se compensan
 * con su contra-movimiento, por lo que el saldo esperado siempre se deriva de
 * movimientos vigentes.
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
    .where('movement.sessionID = :sessionID', { sessionID })
    .andWhere('movement.status = :posted', {
      posted: CashMovementStatus.POSTED,
    })
    .setParameters({
      cashIn: CashMovementType.CASH_IN,
      cashOut: CashMovementType.CASH_OUT,
    })
    .getRawOne<{ net: string; cashIn: string; cashOut: string }>();

  const cashIn = toMoney(Number(raw?.cashIn ?? 0));
  const cashOut = toMoney(Number(raw?.cashOut ?? 0));

  return {
    cashIn,
    cashOut,
    net: toMoney(cashIn - cashOut),
  };
}
