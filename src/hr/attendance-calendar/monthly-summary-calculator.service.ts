import { Injectable } from '@nestjs/common';
import { AttendanceOverrideType } from '../attendance-overrides/entities/attendance-override.entity';
import { CalendarDay } from './calendar-builder.service';

export interface AttendanceSummary {
  presentCount: number;
  absentCount: number;
  employeeDays: number;
  closedDays: number;
  employees: Array<{
    employeeID: string;
    name: string;
    role: string;
    presentCount: number;
    absentCount: number;
    closedDays: number;
  }>;
}

@Injectable()
export class MonthlySummaryCalculatorService {
  calculate(days: CalendarDay[]): AttendanceSummary {
    const byEmployee = new Map<
      string,
      AttendanceSummary['employees'][number]
    >();
    let presentCount = 0;
    let absentCount = 0;
    let employeeDays = 0;
    let closedDays = 0;

    for (const day of days) {
      presentCount += day.presentCount;
      absentCount += day.absentCount;
      if (day.storeStatus === 'CLOSED') closedDays += 1;
      employeeDays += day.employeeCount;

      for (const employee of day.employees) {
        const current = byEmployee.get(employee.employeeID) ?? {
          employeeID: employee.employeeID,
          name: employee.name,
          role: employee.role,
          presentCount: 0,
          absentCount: 0,
          closedDays: 0,
        };
        if (
          employee.status === 'PRESENT' ||
          employee.status === AttendanceOverrideType.PRESENT_ON_CLOSED_DAY
        ) {
          current.presentCount += 1;
        } else if (day.storeStatus === 'OPEN') {
          current.absentCount += 1;
        } else {
          current.closedDays += 1;
        }
        byEmployee.set(employee.employeeID, current);
      }
    }

    return {
      presentCount,
      absentCount,
      employeeDays,
      closedDays,
      employees: [...byEmployee.values()],
    };
  }
}
