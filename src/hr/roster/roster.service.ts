import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { TenantContextService } from '../../multitenant/tenant-context.service';
import { UserStore } from '../../relations/userstores/entities/userstore.entity';
import { getZonedParts } from '../../common/utils/date-timezone.util';
import { parseDateOnly } from '../common/date-range.util';
import { EmployeeSummaryDto } from './dto/employee-summary.dto';

export interface RosterEntry {
  employeeID: string;
  name: string;
  role: string;
  effectiveFrom: string;
  effectiveTo: string | null;
}

/**
 * Retorna, para una fecha dada, una única asignación por trabajador.
 *
 * La cobertura de cada intervalo es inclusiva: `effectiveFrom <= date` y
 * (`effectiveTo === null` o `effectiveTo >= date`). Si un trabajador tiene más
 * de una fila cubriendo la fecha (por ejemplo, una desvinculación y una
 * revinculación el mismo día), se conserva la fila vigente o, en su defecto,
 * la de `effectiveFrom` más reciente. Se preserva el orden de entrada.
 */
export function selectEntriesForDate(
  entries: RosterEntry[],
  date: string,
): RosterEntry[] {
  const selected = new Map<string, RosterEntry>();

  for (const entry of entries) {
    if (entry.effectiveFrom > date) continue;
    if (entry.effectiveTo !== null && entry.effectiveTo < date) continue;

    const current = selected.get(entry.employeeID);
    if (current && !isPreferredEntry(entry, current)) continue;

    selected.set(entry.employeeID, entry);
  }

  return Array.from(selected.values());
}

function isPreferredEntry(
  candidate: RosterEntry,
  current: RosterEntry,
): boolean {
  const candidateIsActive = candidate.effectiveTo === null;
  const currentIsActive = current.effectiveTo === null;
  if (candidateIsActive !== currentIsActive) return candidateIsActive;

  if (candidate.effectiveFrom !== current.effectiveFrom) {
    return candidate.effectiveFrom > current.effectiveFrom;
  }

  if (candidate.effectiveTo !== current.effectiveTo) {
    return (candidate.effectiveTo ?? '') > (current.effectiveTo ?? '');
  }

  return false;
}

@Injectable()
export class RosterService {
  constructor(
    @InjectRepository(UserStore)
    private readonly userStoreRepository: Repository<UserStore>,
    @Optional() private readonly tenantContext?: TenantContextService,
  ) {}

  private runInTransaction<T>(
    callback: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return this.tenantContext
      ? this.tenantContext.transaction(callback)
      : this.userStoreRepository.manager.transaction(callback);
  }

  getToday(): string {
    const parts = getZonedParts(new Date(), this.tenantContext?.getTimeZone());
    return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
  }

  async getActiveEmployees(
    storeID: string,
    date = this.getToday(),
    employeeID?: string,
  ): Promise<EmployeeSummaryDto[]> {
    parseDateOnly(date, 'date');
    const entries = await this.getEntries(storeID, date, date, employeeID);
    return selectEntriesForDate(entries, date).map((entry) => ({ ...entry }));
  }

  getEntries(
    storeID: string,
    from: string,
    to: string,
    employeeID?: string,
  ): Promise<RosterEntry[]> {
    parseDateOnly(from, 'from');
    parseDateOnly(to, 'to');

    return this.runInTransaction(async (manager) => {
      const tenantID = this.tenantContext?.getTenantId();
      const query = manager
        .getRepository(UserStore)
        .createQueryBuilder('assignment')
        .innerJoinAndSelect('assignment.user', 'user')
        .leftJoinAndSelect('user.roleEntity', 'role')
        .where('assignment.storeID = :storeID', { storeID })
        .andWhere('assignment.effectiveFrom <= :to', { to })
        .andWhere(
          '(assignment.effectiveTo IS NULL OR assignment.effectiveTo >= :from)',
          { from },
        )
        .andWhere('user.isSystem = false')
        .orderBy('user.name', 'ASC');

      if (tenantID) {
        query
          .andWhere('assignment.tenantID = :tenantID', { tenantID })
          .andWhere('user.tenantID = :tenantID', { tenantID });
      }
      if (employeeID) {
        query.andWhere('assignment.userID = :employeeID', { employeeID });
      }

      const assignments = await query.getMany();
      return assignments.map((assignment) => ({
        employeeID: assignment.user.userID,
        name: assignment.user.name,
        role: assignment.user.roleEntity?.name ?? assignment.user.role,
        effectiveFrom: assignment.effectiveFrom,
        effectiveTo: assignment.effectiveTo,
      }));
    });
  }
}
