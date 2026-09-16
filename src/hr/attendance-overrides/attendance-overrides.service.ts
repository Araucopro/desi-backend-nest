import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Store } from '../../stores/entities/store.entity';
import { User } from '../../users/entities/user.entity';
import { UserStore } from '../../relations/userstores/entities/userstore.entity';
import { TenantContextService } from '../../multitenant/tenant-context.service';
import { assertDateRange, parseDateOnly } from '../common/date-range.util';
import { HrActor } from '../store-closures/store-closures.service';
import {
  AttendanceAuditAction,
  AttendanceOverrideAuditLog,
} from './entities/attendance-override-audit-log.entity';
import { AttendanceOverride } from './entities/attendance-override.entity';
import { CreateAttendanceOverrideDto } from './dto/create-attendance-override.dto';
import { UpdateAttendanceOverrideDto } from './dto/update-attendance-override.dto';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';

@Injectable()
export class AttendanceOverridesService {
  constructor(
    @InjectRepository(AttendanceOverride)
    private readonly overrideRepository: Repository<AttendanceOverride>,
    @InjectRepository(AttendanceOverrideAuditLog)
    private readonly auditRepository: Repository<AttendanceOverrideAuditLog>,
    @InjectRepository(UserStore)
    private readonly userStoreRepository: Repository<UserStore>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,
    @Optional() private readonly tenantContext?: TenantContextService,
  ) {}

  private runInTransaction<T>(
    callback: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return this.tenantContext
      ? this.tenantContext.transaction(callback)
      : this.overrideRepository.manager.transaction(callback);
  }

  private tenantID(): string | undefined {
    return this.tenantContext?.get(false)?.tenantId;
  }

  private async assertStore(
    manager: EntityManager,
    storeID: string,
  ): Promise<Store> {
    const store = await manager.getRepository(Store).findOne({
      where: {
        storeID,
        ...(this.tenantID() ? { tenantID: this.tenantID() } : {}),
      },
    });
    if (!store) throw new NotFoundException('Tienda no encontrada');
    return store;
  }

  private async assertEmployeeAssignment(
    manager: EntityManager,
    employeeID: string,
    storeID: string,
    startDate: string,
    endDate: string,
  ): Promise<User> {
    const user = await manager.getRepository(User).findOne({
      where: {
        userID: employeeID,
        ...(this.tenantID() ? { tenantID: this.tenantID() } : {}),
        isSystem: false,
      },
    });
    if (!user) throw new NotFoundException('Trabajador no encontrado');

    const query = manager
      .getRepository(UserStore)
      .createQueryBuilder('assignment')
      .where('assignment.userID = :employeeID', { employeeID })
      .andWhere('assignment.storeID = :storeID', { storeID })
      .andWhere('assignment.effectiveFrom <= :startDate', { startDate })
      .andWhere(
        '(assignment.effectiveTo IS NULL OR assignment.effectiveTo >= :endDate)',
        { endDate },
      );
    if (this.tenantID()) {
      query.andWhere('assignment.tenantID = :tenantID', {
        tenantID: this.tenantID(),
      });
    }
    if (!(await query.getExists())) {
      throw new BadRequestException(
        'El trabajador no estuvo asignado a la tienda durante todo el rango',
      );
    }
    return user;
  }

  private async assertNoOverlap(
    manager: EntityManager,
    employeeID: string,
    storeID: string,
    startDate: string,
    endDate: string,
    excludedID?: string,
  ): Promise<void> {
    await manager.query(
      `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
      [`hr:override:${this.tenantID() ?? 'default'}:${storeID}:${employeeID}`],
    );
    const query = manager
      .getRepository(AttendanceOverride)
      .createQueryBuilder('override')
      .where('override.employeeID = :employeeID', { employeeID })
      .andWhere('override.storeID = :storeID', { storeID })
      .andWhere(
        'override.startDate <= :endDate AND override.endDate >= :startDate',
        { startDate, endDate },
      );
    if (this.tenantID()) {
      query.andWhere('override.tenantID = :tenantID', {
        tenantID: this.tenantID(),
      });
    }
    if (excludedID)
      query.andWhere('override.id <> :excludedID', { excludedID });
    if (await query.getExists()) {
      throw new ConflictException(
        'El rango se solapa con una asistencia ya registrada',
      );
    }
  }

  private createAudit(
    manager: EntityManager,
    override: Partial<AttendanceOverride>,
    action: AttendanceAuditAction,
    actor: HrActor,
    previous?: Partial<AttendanceOverride>,
  ): Promise<AttendanceOverrideAuditLog> {
    const repository = manager.getRepository(AttendanceOverrideAuditLog);
    const employeeID = override.employeeID ?? previous?.employeeID;
    const storeID = override.storeID ?? previous?.storeID;
    const affectedStartDate = override.startDate ?? previous?.startDate;
    const affectedEndDate = override.endDate ?? previous?.endDate;
    if (!employeeID || !storeID || !affectedStartDate || !affectedEndDate) {
      throw new BadRequestException(
        'No se pudo construir la auditoría del override',
      );
    }
    return repository.save(
      repository.create({
        tenantID: this.tenantID(),
        overrideID: override.id ?? previous?.id ?? null,
        employeeID,
        storeID,
        action,
        affectedStartDate,
        affectedEndDate,
        previousType: previous?.type ?? null,
        newType:
          action === AttendanceAuditAction.DELETED
            ? null
            : (override.type ?? null),
        previousReason: previous?.reason ?? null,
        newReason:
          action === AttendanceAuditAction.DELETED
            ? null
            : (override.reason ?? null),
        performedByUserID: actor.userID ?? null,
        performedByMasterUserID: actor.masterUserID ?? null,
        performedAt: new Date(),
      }),
    );
  }

  async create(
    storeID: string,
    dto: CreateAttendanceOverrideDto,
    actor: HrActor,
  ): Promise<AttendanceOverride> {
    assertDateRange(dto.startDate, dto.endDate);
    return this.runInTransaction(async (manager) => {
      const store = await this.assertStore(manager, storeID);
      const employee = await this.assertEmployeeAssignment(
        manager,
        dto.employeeID,
        storeID,
        dto.startDate,
        dto.endDate,
      );
      await this.assertNoOverlap(
        manager,
        dto.employeeID,
        storeID,
        dto.startDate,
        dto.endDate,
      );
      const repository = manager.getRepository(AttendanceOverride);
      const override = await repository.save(
        repository.create({
          tenantID: this.tenantID(),
          employeeID: employee.userID,
          employee,
          storeID,
          store,
          startDate: dto.startDate,
          endDate: dto.endDate,
          type: dto.type,
          reason: dto.reason.trim(),
        }),
      );
      await this.createAudit(
        manager,
        override,
        AttendanceAuditAction.CREATED,
        actor,
      );
      return override;
    });
  }

  async update(
    storeID: string,
    id: string,
    dto: UpdateAttendanceOverrideDto,
    actor: HrActor,
  ): Promise<AttendanceOverride> {
    return this.runInTransaction(async (manager) => {
      const repository = manager.getRepository(AttendanceOverride);
      const override = await repository.findOne({
        where: {
          id,
          storeID,
          ...(this.tenantID() ? { tenantID: this.tenantID() } : {}),
        },
      });
      if (!override) throw new NotFoundException('Override no encontrado');

      const nextStart = dto.startDate ?? override.startDate;
      const nextEnd = dto.endDate ?? override.endDate;
      const nextType = dto.type ?? override.type;
      const nextReason = dto.reason?.trim() ?? override.reason;
      assertDateRange(nextStart, nextEnd);
      await this.assertEmployeeAssignment(
        manager,
        override.employeeID,
        storeID,
        nextStart,
        nextEnd,
      );
      await this.assertNoOverlap(
        manager,
        override.employeeID,
        storeID,
        nextStart,
        nextEnd,
        id,
      );

      const previous = { ...override };
      override.startDate = nextStart;
      override.endDate = nextEnd;
      override.type = nextType;
      override.reason = nextReason;
      const saved = await repository.save(override);
      await this.createAudit(
        manager,
        saved,
        AttendanceAuditAction.UPDATED,
        actor,
        previous,
      );
      return saved;
    });
  }

  async remove(storeID: string, id: string, actor: HrActor): Promise<void> {
    await this.runInTransaction(async (manager) => {
      const repository = manager.getRepository(AttendanceOverride);
      const override = await repository.findOne({
        where: {
          id,
          storeID,
          ...(this.tenantID() ? { tenantID: this.tenantID() } : {}),
        },
      });
      if (!override) throw new NotFoundException('Override no encontrado');
      await this.createAudit(
        manager,
        override,
        AttendanceAuditAction.DELETED,
        actor,
        override,
      );
      await repository.remove(override);
    });
  }

  async findAudit(
    storeID: string,
    queryDto: AuditLogQueryDto,
  ): Promise<AttendanceOverrideAuditLog[]> {
    if (queryDto.from && queryDto.to) {
      assertDateRange(queryDto.from, queryDto.to);
    }
    return this.runInTransaction(async (manager) => {
      const query = manager
        .getRepository(AttendanceOverrideAuditLog)
        .createQueryBuilder('audit')
        .where('audit.storeID = :storeID', { storeID })
        .orderBy('audit.performedAt', 'DESC')
        .take(queryDto.limit ?? 50)
        .skip(queryDto.offset ?? 0);
      if (this.tenantID()) {
        query.andWhere('audit.tenantID = :tenantID', {
          tenantID: this.tenantID(),
        });
      }
      if (queryDto.employeeID) {
        query.andWhere('audit.employeeID = :employeeID', {
          employeeID: queryDto.employeeID,
        });
      }
      if (queryDto.from) {
        parseDateOnly(queryDto.from, 'from');
        query.andWhere('audit.affectedEndDate >= :from', {
          from: queryDto.from,
        });
      }
      if (queryDto.to) {
        parseDateOnly(queryDto.to, 'to');
        query.andWhere('audit.affectedStartDate <= :to', { to: queryDto.to });
      }
      return query.getMany();
    });
  }
}
