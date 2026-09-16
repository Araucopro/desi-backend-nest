import { Injectable } from '@nestjs/common';
import { RosterEntry, selectEntriesForDate } from '../roster/roster.service';
import { AttendanceOverrideType } from '../attendance-overrides/entities/attendance-override.entity';
import { eachDate } from '../common/date-range.util';

export interface CalendarClosure {
  startDate: string;
  endDate: string;
}

export interface CalendarOverride {
  id: string;
  employeeID: string;
  startDate: string;
  endDate: string;
  type: AttendanceOverrideType;
  reason: string;
}

export type CalendarEmployeeStatus =
  | 'PRESENT'
  | 'CLOSED'
  | AttendanceOverrideType;

export interface CalendarEmployee {
  employeeID: string;
  name: string;
  role: string;
  status: CalendarEmployeeStatus;
  reason: string | null;
  overrideID: string | null;
}

export interface CalendarDay {
  date: string;
  storeStatus: 'OPEN' | 'CLOSED';
  employeeCount: number;
  presentCount: number;
  absentCount: number;
  employees: CalendarEmployee[];
}

@Injectable()
export class CalendarBuilderService {
  buildRange(
    from: string,
    to: string,
    roster: RosterEntry[],
    closures: CalendarClosure[],
    overrides: CalendarOverride[],
  ): CalendarDay[] {
    return eachDate(from, to).map((date) => {
      const dayRoster = selectEntriesForDate(roster, date);
      const isClosed = closures.some(
        (closure) => closure.startDate <= date && closure.endDate >= date,
      );
      let presentCount = 0;
      let absentCount = 0;

      const employees = dayRoster.map((entry) => {
        const override = overrides.find(
          (item) =>
            item.employeeID === entry.employeeID &&
            item.startDate <= date &&
            item.endDate >= date,
        );

        let status: CalendarEmployeeStatus = 'PRESENT';
        if (isClosed && !override) {
          status = 'CLOSED';
        } else if (override) {
          status = override.type;
        }

        if (
          status === 'PRESENT' ||
          status === AttendanceOverrideType.PRESENT_ON_CLOSED_DAY
        ) {
          presentCount += 1;
        } else if (!isClosed) {
          absentCount += 1;
        }

        return {
          employeeID: entry.employeeID,
          name: entry.name,
          role: entry.role,
          status,
          reason: override?.reason ?? null,
          overrideID: override?.id ?? null,
        };
      });

      return {
        date,
        storeStatus: isClosed ? 'CLOSED' : 'OPEN',
        employeeCount: dayRoster.length,
        presentCount,
        absentCount,
        employees,
      };
    });
  }
}
