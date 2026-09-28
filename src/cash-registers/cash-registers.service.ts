import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import {
  CashRegister,
  CashRegisterStatus,
} from './entities/cash-register.entity';
import {
  CashRegisterSession,
  CashRegisterSessionStatus,
} from './entities/cash-register-session.entity';
import { Store } from '../stores/entities/store.entity';
import { TenantContextService } from '../multitenant/tenant-context.service';
import { CreateCashRegisterDto } from './dto/create-cash-register.dto';
import { UpdateCashRegisterDto } from './dto/update-cash-register.dto';
import { OpenCashSessionDto } from './dto/open-cash-session.dto';
import { CloseCashSessionDto } from './dto/close-cash-session.dto';
import { QueryCashRegistersDto } from './dto/query-cash-registers.dto';
import { QueryCashSessionsDto } from './dto/query-cash-sessions.dto';
import {
  isUniqueViolation,
  resolveDbConstraint,
} from '../common/utils/db-errors.util';
import {
  JwtPayload,
  MasterJwtPayload,
} from '../auth/interfaces/jwt-payload.interface';
import {
  attachSessionOperator,
  assertUserCanAccessStore,
  closeSessionOperators,
  countOpenSessionTransfers,
  resolveActingUserId,
  sumSessionCashMovements,
  toMoney,
} from './cash-registers.helpers';

/**
 * Índice único parcial de operador activo por sesión
 * (`CashRegisterSessionUser`). Comparte el código `23505` con el índice de
 * sesión abierta por caja, por eso se distingue por nombre al traducir el error.
 */
const SESSION_OPERATOR_CONSTRAINT = 'IDX_unique_active_session_user';

/** Índice único parcial de una sola sesión `OPEN` por caja. */
const SINGLE_OPEN_SESSION_CONSTRAINT = 'IDX_unique_open_session_per_register';

@Injectable()
export class CashRegistersService {
  constructor(
    @InjectRepository(CashRegister)
    private readonly cashRegisterRepository: Repository<CashRegister>,
    @InjectRepository(CashRegisterSession)
    private readonly sessionRepository: Repository<CashRegisterSession>,
    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,
    @Optional() private readonly tenantContext?: TenantContextService,
  ) {}

  private runInTransaction<T>(
    cb: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return this.tenantContext
      ? this.tenantContext.transaction(cb)
      : this.cashRegisterRepository.manager.transaction(cb);
  }

  private getEffectiveTenantId(): string {
    const tenantId = this.tenantContext?.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('Contexto tenant no disponible');
    }
    return tenantId;
  }

  async create(dto: CreateCashRegisterDto): Promise<CashRegister> {
    const tenantID = this.getEffectiveTenantId();

    return this.runInTransaction(async (manager) => {
      const store = await manager.getRepository(Store).findOne({
        where: { storeID: dto.storeID, tenantID },
      });

      if (!store) {
        throw new NotFoundException(
          `Tienda con ID ${dto.storeID} no encontrada en este tenant`,
        );
      }

      const existingCode = await manager.getRepository(CashRegister).findOne({
        where: {
          storeID: dto.storeID,
          code: dto.code.trim().toUpperCase(),
          tenantID,
        },
      });

      if (existingCode) {
        throw new ConflictException(
          `Ya existe una caja con el código "${dto.code}" en esta tienda`,
        );
      }

      const cashRegister = manager.getRepository(CashRegister).create({
        tenantID,
        storeID: dto.storeID,
        code: dto.code.trim().toUpperCase(),
        name: dto.name.trim(),
        status: dto.status ?? CashRegisterStatus.ACTIVE,
      });

      try {
        return await manager.getRepository(CashRegister).save(cashRegister);
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ConflictException(
            `Ya existe una caja con el código "${dto.code}" en esta tienda`,
          );
        }
        throw error;
      }
    });
  }

  async findAll(query: QueryCashRegistersDto): Promise<CashRegister[]> {
    const tenantID = this.getEffectiveTenantId();
    const where: Record<string, unknown> = { tenantID };

    if (query.storeID) {
      where.storeID = query.storeID;
    }
    if (query.status) {
      where.status = query.status;
    }

    return this.cashRegisterRepository.find({
      where,
      relations: ['store'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(cashRegisterID: string): Promise<CashRegister> {
    const tenantID = this.getEffectiveTenantId();
    const register = await this.cashRegisterRepository.findOne({
      where: { cashRegisterID, tenantID },
      relations: ['store'],
    });

    if (!register) {
      throw new NotFoundException(
        `Caja con ID ${cashRegisterID} no encontrada`,
      );
    }

    return register;
  }

  async update(
    cashRegisterID: string,
    dto: UpdateCashRegisterDto,
  ): Promise<CashRegister> {
    const tenantID = this.getEffectiveTenantId();

    return this.runInTransaction(async (manager) => {
      const register = await manager.getRepository(CashRegister).findOne({
        where: { cashRegisterID, tenantID },
      });

      if (!register) {
        throw new NotFoundException(
          `Caja con ID ${cashRegisterID} no encontrada`,
        );
      }

      if (dto.code && dto.code.trim().toUpperCase() !== register.code) {
        const duplicate = await manager.getRepository(CashRegister).findOne({
          where: {
            storeID: register.storeID,
            code: dto.code.trim().toUpperCase(),
            tenantID,
          },
        });

        if (duplicate && duplicate.cashRegisterID !== cashRegisterID) {
          throw new ConflictException(
            `Ya existe una caja con el código "${dto.code}" en esta tienda`,
          );
        }
        register.code = dto.code.trim().toUpperCase();
      }

      if (dto.name) {
        register.name = dto.name.trim();
      }

      if (dto.status) {
        register.status = dto.status;
      }

      try {
        return await manager.getRepository(CashRegister).save(register);
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ConflictException(
            `Conflicto de unicidad al actualizar la caja "${register.code}"`,
          );
        }
        throw error;
      }
    });
  }

  async openSession(
    cashRegisterID: string,
    dto: OpenCashSessionDto,
    user: JwtPayload | MasterJwtPayload,
  ): Promise<CashRegisterSession> {
    const tenantID = this.getEffectiveTenantId();
    const userId = resolveActingUserId(user);

    return this.runInTransaction(async (manager) => {
      // El lock sobre la caja serializa las aperturas concurrentes: la segunda
      // transacción espera al commit de la primera y vuelve a leer la sesión ya
      // creada, en vez de chocar contra el índice único parcial. Es la misma
      // fila que bloquea closeSession, así que no introduce un orden de lock
      // nuevo. El catch de `23505` sigue siendo la garantía real.
      const register = await manager.getRepository(CashRegister).findOne({
        where: { cashRegisterID, tenantID },
        lock: { mode: 'pessimistic_write' },
      });

      if (!register) {
        throw new NotFoundException(
          `Caja con ID ${cashRegisterID} no encontrada`,
        );
      }

      if (register.status !== CashRegisterStatus.ACTIVE) {
        throw new BadRequestException(
          `La caja se encuentra en estado "${register.status}" y no puede abrirse`,
        );
      }

      await assertUserCanAccessStore(manager, user, register.storeID);

      const activeSession = await manager
        .getRepository(CashRegisterSession)
        .findOne({
          where: {
            cashRegisterID,
            tenantID,
            status: CashRegisterSessionStatus.OPEN,
          },
        });

      if (activeSession) {
        return this.resolveExistingOpenSession(activeSession, userId, dto);
      }

      const session = manager.getRepository(CashRegisterSession).create({
        tenantID,
        cashRegisterID,
        businessDate: dto.businessDate,
        openedByUserID: userId,
        openedAt: new Date(),
        openingBalance: dto.openingBalance,
        status: CashRegisterSessionStatus.OPEN,
        openingNotes: dto.openingNotes?.trim() ?? null,
      });

      let savedSession: CashRegisterSession;
      try {
        savedSession = await manager
          .getRepository(CashRegisterSession)
          .save(session);
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw this.buildOpenSessionConflict(error);
        }
        throw error;
      }

      // Hito 4: la apertura deja al cajero en turno para que la sesión tenga
      // trazabilidad de operadores desde su primer minuto.
      await attachSessionOperator(manager, {
        tenantID,
        sessionID: savedSession.sessionID,
        userID: userId,
        assignedByUserID: userId,
        enteredAt: savedSession.openedAt,
      });

      return savedSession;
    });
  }

  /**
   * Decide qué hacer cuando la caja ya tiene una sesión `OPEN`. Un reintento del
   * mismo usuario para la misma fecha contable es idempotente y devuelve la
   * sesión existente (evita el falso error del doble envío); cualquier otro caso
   * es un conflicto legítimo y el mensaje incluye el ID para que el cliente
   * pueda recuperar la sesión en curso.
   */
  private resolveExistingOpenSession(
    activeSession: CashRegisterSession,
    userId: string,
    dto: OpenCashSessionDto,
  ): CashRegisterSession {
    const isSameOperator = activeSession.openedByUserID === userId;
    const isSameBusinessDate = activeSession.businessDate === dto.businessDate;

    if (isSameOperator && isSameBusinessDate) {
      return activeSession;
    }

    throw new ConflictException(
      `La caja ya tiene una sesión abierta activa (ID: ${activeSession.sessionID})`,
    );
  }

  /**
   * Traduce la violación de unicidad del `INSERT` de sesión. El mismo código
   * `23505` lo emiten dos índices distintos: el parcial de sesión abierta por
   * caja y el de operador activo por sesión (`attachSessionOperator`). Sin mirar
   * el constraint, el segundo caso reportaría una causa falsa.
   */
  private buildOpenSessionConflict(error: unknown): ConflictException {
    const constraint = resolveDbConstraint(error);

    if (constraint === SESSION_OPERATOR_CONSTRAINT) {
      return new ConflictException(
        'El operador ya está registrado como activo en una sesión de esta caja',
      );
    }

    return new ConflictException(
      constraint === SINGLE_OPEN_SESSION_CONSTRAINT || !constraint
        ? 'Ya existe una sesión abierta activa para esta caja'
        : 'Ya existe una sesión abierta activa para esta caja (conflicto de unicidad)',
    );
  }

  async getActiveSession(cashRegisterID: string): Promise<CashRegisterSession> {
    const tenantID = this.getEffectiveTenantId();
    const session = await this.sessionRepository.findOne({
      where: {
        cashRegisterID,
        tenantID,
        status: CashRegisterSessionStatus.OPEN,
      },
      relations: ['cashRegister'],
    });

    if (!session) {
      throw new NotFoundException(
        `No existe una sesión activa abierta para la caja con ID ${cashRegisterID}`,
      );
    }

    return session;
  }

  async closeSession(
    cashRegisterID: string,
    dto: CloseCashSessionDto,
    user: JwtPayload | MasterJwtPayload,
  ): Promise<CashRegisterSession> {
    const tenantID = this.getEffectiveTenantId();
    const userId =
      user.type === 'master'
        ? (user as MasterJwtPayload).masterUserId
        : user.userId || user.id;

    return this.runInTransaction(async (manager) => {
      const register = await manager.getRepository(CashRegister).findOne({
        where: { cashRegisterID, tenantID },
      });

      if (!register) {
        throw new NotFoundException(
          `Caja con ID ${cashRegisterID} no encontrada`,
        );
      }

      await assertUserCanAccessStore(manager, user, register.storeID);

      const session = await manager.getRepository(CashRegisterSession).findOne({
        where: {
          cashRegisterID,
          tenantID,
          status: CashRegisterSessionStatus.OPEN,
        },
        // Serializa el cierre contra cobros y movimientos concurrentes.
        lock: { mode: 'pessimistic_write' },
      });

      if (!session) {
        throw new NotFoundException(
          `No existe una sesión abierta activa para cerrar en la caja con ID ${cashRegisterID}`,
        );
      }

      // Hito 5: una sesión hermética no puede dejar traslados de fondos en
      // curso, porque ya no podrían ejecutarse sobre ella.
      const openTransfers = await countOpenSessionTransfers(
        manager,
        tenantID,
        session.sessionID,
      );
      if (openTransfers > 0) {
        throw new BadRequestException(
          `La sesión tiene ${openTransfers} transferencia(s) de fondos en curso (PENDING/APPROVED). Complételas, recháncelas o cancélelas antes de cerrar la caja`,
        );
      }

      // Saldo esperado = fondo inicial + entradas - salidas registradas
      // (los cobros en efectivo entran como CashMovement CASH_IN).
      const totals = await sumSessionCashMovements(manager, session.sessionID);
      const expectedCashBalance = toMoney(
        Number(session.openingBalance) + totals.net,
      );
      const countedCashBalance = toMoney(Number(dto.countedCashBalance));
      const cashDifference = toMoney(countedCashBalance - expectedCashBalance);
      const closedAt = new Date();

      session.expectedCashBalance = expectedCashBalance;
      session.countedCashBalance = countedCashBalance;
      session.cashDifference = cashDifference;
      session.closedByUserID = userId;
      session.closedAt = closedAt;
      session.status = CashRegisterSessionStatus.CLOSED;
      session.closingNotes = dto.closingNotes?.trim() ?? null;

      const savedSession = await manager
        .getRepository(CashRegisterSession)
        .save(session);

      // Hito 4: el cierre directo también cierra los turnos de los operadores.
      await closeSessionOperators(manager, savedSession.sessionID, closedAt);

      return savedSession;
    });
  }

  async findSessions(
    cashRegisterID: string,
    query: QueryCashSessionsDto,
  ): Promise<CashRegisterSession[]> {
    const tenantID = this.getEffectiveTenantId();

    const queryBuilder = this.sessionRepository
      .createQueryBuilder('session')
      .where('session.tenantID = :tenantID', { tenantID })
      .andWhere('session.cashRegisterID = :cashRegisterID', { cashRegisterID });

    if (query.status) {
      queryBuilder.andWhere('session.status = :status', {
        status: query.status,
      });
    }

    if (query.fromBusinessDate) {
      queryBuilder.andWhere('session.businessDate >= :from', {
        from: query.fromBusinessDate,
      });
    }

    if (query.toBusinessDate) {
      queryBuilder.andWhere('session.businessDate <= :to', {
        to: query.toBusinessDate,
      });
    }

    return queryBuilder.orderBy('session.openedAt', 'DESC').getMany();
  }
}
