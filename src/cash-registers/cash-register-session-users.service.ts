import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, Repository } from 'typeorm';
import {
  JwtPayload,
  MasterJwtPayload,
} from '../auth/interfaces/jwt-payload.interface';
import { isUniqueViolation } from '../common/utils/db-errors.util';
import { TenantContextService } from '../multitenant/tenant-context.service';
import { UserStore } from '../relations/userstores/entities/userstore.entity';
import { UserstoresService } from '../relations/userstores/userstores.service';
import { UserStatus } from '../users/entities/user.entity';
import {
  assertUserCanAccessStore,
  findCashRegisterOrFail,
  findOpenSessionOrFail,
  resolveActingUserId,
} from './cash-registers.helpers';
import { AssignCashSessionUserDto } from './dto/assign-cash-session-user.dto';
import { QueryCashSessionUsersDto } from './dto/query-cash-session-users.dto';
import { RegisterCashSessionUserExitDto } from './dto/register-cash-session-user-exit.dto';
import {
  CashRegisterSessionUser,
  CashRegisterSessionUserRole,
} from './entities/cash-register-session-user.entity';
import { CashRegister } from './entities/cash-register.entity';
import { CashRegisterSession } from './entities/cash-register-session.entity';

@Injectable()
export class CashRegisterSessionUsersService {
  constructor(
    @InjectRepository(CashRegisterSessionUser)
    private readonly sessionUserRepository: Repository<CashRegisterSessionUser>,
    private readonly userstoresService: UserstoresService,
    @Optional() private readonly tenantContext?: TenantContextService,
  ) {}

  private runInTransaction<T>(
    callback: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return this.tenantContext
      ? this.tenantContext.transaction(callback)
      : this.sessionUserRepository.manager.transaction(callback);
  }

  private getEffectiveTenantId(): string {
    const tenantId = this.tenantContext?.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('Contexto tenant no disponible');
    }
    return tenantId;
  }

  /**
   * Valida caja, pertenencia de tienda del usuario y la sesión `OPEN` de la
   * ruta. La sesión se bloquea para que la asignación de operadores no corra
   * en paralelo con el cierre del turno.
   */
  private async resolveOpenSession(
    manager: EntityManager,
    cashRegisterID: string,
    sessionID: string,
    user: JwtPayload | MasterJwtPayload,
    tenantID: string,
  ): Promise<{ register: CashRegister; session: CashRegisterSession }> {
    const register = await findCashRegisterOrFail(
      manager,
      cashRegisterID,
      tenantID,
    );
    await assertUserCanAccessStore(
      this.userstoresService,
      user,
      register.storeID,
    );

    const session = await findOpenSessionOrFail(manager, cashRegisterID, {
      tenantID,
      lock: true,
    });
    if (session.sessionID !== sessionID) {
      throw new NotFoundException(
        `Sesión con ID ${sessionID} no encontrada para la caja ${cashRegisterID}`,
      );
    }

    return { register, session };
  }

  /**
   * Solo puede operar la caja quien tiene relación vigente `UserStore` con la
   * tienda; además el usuario debe estar activo.
   */
  private async assertOperatorBelongsToStore(
    manager: EntityManager,
    tenantID: string,
    storeID: string,
    userID: string,
  ): Promise<void> {
    const assignment = await manager.getRepository(UserStore).findOne({
      where: {
        tenantID,
        store: { storeID },
        user: { userID },
        effectiveTo: IsNull(),
        removedAt: IsNull(),
      },
      relations: ['user'],
    });

    if (!assignment) {
      throw new BadRequestException(
        'El usuario no está asignado a la tienda de esta caja',
      );
    }

    if (assignment.user?.status === UserStatus.INACTIVE) {
      throw new BadRequestException(
        'El usuario está inactivo y no puede quedar a cargo de la caja',
      );
    }
  }

  private appendNote(current: string | null | undefined, next: string): string {
    const previous = current?.trim();
    const trimmed = next.trim();

    return previous ? `${previous} | ${trimmed}` : trimmed;
  }

  /**
   * Asigna un cajero a la sesión abierta. La hora de entrada por defecto es el
   * momento del request y nunca puede ser anterior a la apertura de la sesión.
   */
  async assign(
    cashRegisterID: string,
    sessionID: string,
    dto: AssignCashSessionUserDto,
    user: JwtPayload | MasterJwtPayload,
  ): Promise<CashRegisterSessionUser> {
    const tenantID = this.getEffectiveTenantId();
    const actingUserID = resolveActingUserId(user);

    return this.runInTransaction(async (manager) => {
      const { register, session } = await this.resolveOpenSession(
        manager,
        cashRegisterID,
        sessionID,
        user,
        tenantID,
      );
      await this.assertOperatorBelongsToStore(
        manager,
        tenantID,
        register.storeID,
        dto.userID,
      );

      const enteredAt = dto.enteredAt ? new Date(dto.enteredAt) : new Date();
      if (enteredAt.getTime() < new Date(session.openedAt).getTime()) {
        throw new BadRequestException(
          'La hora de entrada no puede ser anterior a la apertura de la sesión',
        );
      }

      const repository = manager.getRepository(CashRegisterSessionUser);
      const activeRecord = await repository.findOne({
        where: {
          tenantID,
          sessionID: session.sessionID,
          userID: dto.userID,
          leftAt: IsNull(),
        },
      });
      if (activeRecord) {
        throw new ConflictException(
          `El usuario ya está en turno en esta sesión (registro: ${activeRecord.sessionUserID})`,
        );
      }

      const record = repository.create({
        tenantID,
        sessionID: session.sessionID,
        userID: dto.userID,
        role: dto.role ?? CashRegisterSessionUserRole.OPERATOR,
        assignedByUserID: actingUserID,
        enteredAt,
        leftAt: null,
        notes: dto.notes?.trim() || null,
      });

      try {
        return await repository.save(record);
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ConflictException(
            'El usuario ya está en turno en esta sesión',
          );
        }
        throw error;
      }
    });
  }

  /**
   * Registra la salida del operador (fin de su turno dentro de la sesión). La
   * sesión debe seguir `OPEN`: al cerrarse, el sistema cierra los turnos
   * automáticamente.
   */
  async registerExit(
    cashRegisterID: string,
    sessionID: string,
    sessionUserID: string,
    dto: RegisterCashSessionUserExitDto,
    user: JwtPayload | MasterJwtPayload,
  ): Promise<CashRegisterSessionUser> {
    const tenantID = this.getEffectiveTenantId();

    return this.runInTransaction(async (manager) => {
      const { session } = await this.resolveOpenSession(
        manager,
        cashRegisterID,
        sessionID,
        user,
        tenantID,
      );

      const repository = manager.getRepository(CashRegisterSessionUser);
      const record = await repository.findOne({
        where: {
          sessionUserID,
          sessionID: session.sessionID,
          tenantID,
        },
        lock: { mode: 'pessimistic_write' },
      });

      if (!record) {
        throw new NotFoundException(
          `Registro de operador con ID ${sessionUserID} no encontrado en esta sesión`,
        );
      }

      if (record.leftAt) {
        throw new ConflictException(
          `El operador ya registró su salida el ${new Date(record.leftAt).toISOString()}`,
        );
      }

      const leftAt = dto.leftAt ? new Date(dto.leftAt) : new Date();
      if (leftAt.getTime() < new Date(record.enteredAt).getTime()) {
        throw new BadRequestException(
          'La hora de salida no puede ser anterior a la hora de entrada del operador',
        );
      }

      record.leftAt = leftAt;
      if (dto.notes !== undefined) {
        record.notes = this.appendNote(record.notes, dto.notes);
      }

      return repository.save(record);
    });
  }

  async findSessionUsers(
    cashRegisterID: string,
    sessionID: string,
    query: QueryCashSessionUsersDto,
  ): Promise<CashRegisterSessionUser[]> {
    const tenantID = this.getEffectiveTenantId();

    return this.runInTransaction(async (manager) => {
      await findCashRegisterOrFail(manager, cashRegisterID, tenantID);
      const session = await manager
        .getRepository(CashRegisterSession)
        .findOne({ where: { sessionID, cashRegisterID, tenantID } });
      if (!session) {
        throw new NotFoundException(
          `Sesión con ID ${sessionID} no encontrada para la caja ${cashRegisterID}`,
        );
      }

      const queryBuilder = manager
        .getRepository(CashRegisterSessionUser)
        .createQueryBuilder('sessionUser')
        .leftJoinAndSelect('sessionUser.user', 'user')
        .where('sessionUser.tenantID = :tenantID', { tenantID })
        .andWhere('sessionUser.sessionID = :sessionID', {
          sessionID: session.sessionID,
        });

      if (query.active === true) {
        queryBuilder.andWhere('sessionUser.leftAt IS NULL');
      }
      if (query.active === false) {
        queryBuilder.andWhere('sessionUser.leftAt IS NOT NULL');
      }
      if (query.role) {
        queryBuilder.andWhere('sessionUser.role = :role', {
          role: query.role,
        });
      }

      return queryBuilder.orderBy('sessionUser.enteredAt', 'ASC').getMany();
    });
  }
}
