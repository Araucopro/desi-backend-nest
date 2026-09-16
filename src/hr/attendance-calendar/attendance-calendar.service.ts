import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { TenantContextService } from '../../multitenant/tenant-context.service';
import { parseDateOnly, assertDateRange } from '../common/date-range.util';
import { RosterService } from '../roster/roster.service';
import { StoreClosure } from '../store-closures/entities/store-closure.entity';
import { AttendanceOverride } from '../attendance-overrides/entities/attendance-override.entity';
import { CalendarBuilderService } from './calendar-builder.service';
import { MonthlySummaryCalculatorService } from './monthly-summary-calculator.service';

@Injectable()
export class AttendanceCalendarService {
  constructor(
    private readonly rosterService: RosterService,
    @InjectRepository(StoreClosure)
    private readonly closureRepository: Repository<StoreClosure>,
    @InjectRepository(AttendanceOverride)
    private readonly overrideRepository: Repository<AttendanceOverride>,
    private readonly builder: CalendarBuilderService,
    private readonly summaryCalculator: MonthlySummaryCalculatorService,
    @Optional() private readonly tenantContext?: TenantContextService,
  ) {}

  private runInTransaction<T>(
    callback: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return this.tenantContext
      ? this.tenantContext.transaction(callback)
      : this.closureRepository.manager.transaction(callback);
  }

  private tenantID(): string | undefined {
    return this.tenantContext?.get(false)?.tenantId;
  }

  private async build(
    storeID: string,
    from: string,
    to: string,
    employeeID?: string,
  ) {
    assertDateRange(from, to);
    const totalDays = Math.floor(
      (parseDateOnly(to, 'to').getTime() -
        parseDateOnly(from, 'from').getTime()) /
        86_400_000,
    );
    if (totalDays > 366) {
      throw new BadRequestException(
        'El rango máximo de consulta es de 367 días',
      );
    }

    const roster = await this.rosterService.getEntries(
      storeID,
      from,
      to,
      employeeID,
    );
    return this.runInTransaction(async (manager) => {
      const closuresQuery = manager
        .getRepository(StoreClosure)
        .createQueryBuilder('closure')
        .where('closure.storeID = :storeID', { storeID })
        .andWhere('closure.cancelledAt IS NULL')
        .andWhere('closure.startDate <= :to AND closure.endDate >= :from', {
          from,
          to,
        });
      const overridesQuery = manager
        .getRepository(AttendanceOverride)
        .createQueryBuilder('override')
        .where('override.storeID = :storeID', { storeID })
        .andWhere('override.startDate <= :to AND override.endDate >= :from', {
          from,
          to,
        });
      if (this.tenantID()) {
        closuresQuery.andWhere('closure.tenantID = :tenantID', {
          tenantID: this.tenantID(),
        });
        overridesQuery.andWhere('override.tenantID = :tenantID', {
          tenantID: this.tenantID(),
        });
      }
      if (employeeID) {
        overridesQuery.andWhere('override.employeeID = :employeeID', {
          employeeID,
        });
      }
      const [closures, overrides] = await Promise.all([
        closuresQuery.getMany(),
        overridesQuery.getMany(),
      ]);
      return this.builder.buildRange(from, to, roster, closures, overrides);
    });
  }

  async getMonth(storeID: string, month: string, employeeID?: string) {
    const [year, monthNumber] = month.split('-').map(Number);
    const from = `${year}-${String(monthNumber).padStart(2, '0')}-01`;
    const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
    const to = `${year}-${String(monthNumber).padStart(2, '0')}-${lastDay}`;
    return this.build(storeID, from, to, employeeID);
  }

  async getSummary(
    storeID: string,
    from: string,
    to: string,
    employeeID?: string,
  ) {
    const days = await this.build(storeID, from, to, employeeID);
    return {
      storeID,
      from,
      to,
      ...this.summaryCalculator.calculate(days),
    };
  }
}
