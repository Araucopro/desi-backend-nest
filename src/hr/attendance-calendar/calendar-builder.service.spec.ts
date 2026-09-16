import { CalendarBuilderService } from './calendar-builder.service';
import { AttendanceOverrideType } from '../attendance-overrides/entities/attendance-override.entity';

describe('CalendarBuilderService', () => {
  it('defaults to present on open days and does not count closed days as absence', () => {
    const builder = new CalendarBuilderService();
    const result = builder.buildRange(
      '2026-09-06',
      '2026-09-07',
      [
        {
          employeeID: 'employee-1',
          name: 'Ana',
          role: 'store_manager',
          effectiveFrom: '2026-01-01',
          effectiveTo: null,
        },
      ],
      [{ startDate: '2026-09-06', endDate: '2026-09-06' }],
      [],
    );

    expect(result[0]).toMatchObject({
      storeStatus: 'CLOSED',
      presentCount: 0,
      absentCount: 0,
    });
    expect(result[1]).toMatchObject({
      storeStatus: 'OPEN',
      presentCount: 1,
      absentCount: 0,
    });
  });

  it('counts a worker present exceptionally on a closed day', () => {
    const builder = new CalendarBuilderService();
    const result = builder.buildRange(
      '2026-09-06',
      '2026-09-06',
      [
        {
          employeeID: 'employee-1',
          name: 'Ana',
          role: 'store_manager',
          effectiveFrom: '2026-01-01',
          effectiveTo: null,
        },
      ],
      [{ startDate: '2026-09-06', endDate: '2026-09-06' }],
      [
        {
          id: 'override-1',
          employeeID: 'employee-1',
          startDate: '2026-09-06',
          endDate: '2026-09-06',
          type: AttendanceOverrideType.PRESENT_ON_CLOSED_DAY,
          reason: 'Inventario extraordinario',
        },
      ],
    );

    expect(result[0]).toMatchObject({
      storeStatus: 'CLOSED',
      presentCount: 1,
      absentCount: 0,
    });
    expect(result[0].employees[0].status).toBe(
      AttendanceOverrideType.PRESENT_ON_CLOSED_DAY,
    );
  });

  it('collapses a same-day overlap between a closed row and a rehired row', () => {
    const builder = new CalendarBuilderService();
    const result = builder.buildRange(
      '2026-09-14',
      '2026-09-15',
      [
        {
          employeeID: 'employee-1',
          name: 'Miguel',
          role: 'store_manager',
          effectiveFrom: '2026-01-01',
          effectiveTo: '2026-09-15',
        },
        {
          employeeID: 'employee-1',
          name: 'Miguel',
          role: 'store_manager',
          effectiveFrom: '2026-09-15',
          effectiveTo: null,
        },
      ],
      [],
      [],
    );

    expect(result[0]).toMatchObject({
      date: '2026-09-14',
      employeeCount: 1,
      presentCount: 1,
      absentCount: 0,
    });
    expect(result[1]).toMatchObject({
      date: '2026-09-15',
      employeeCount: 1,
      presentCount: 1,
      absentCount: 0,
    });
    expect(result[1].employees).toHaveLength(1);
    expect(result[1].employees[0]).toMatchObject({
      employeeID: 'employee-1',
      name: 'Miguel',
      status: 'PRESENT',
    });
  });

  it('keeps non-overlapping assignment history unchanged', () => {
    const builder = new CalendarBuilderService();
    const result = builder.buildRange(
      '2026-09-14',
      '2026-09-15',
      [
        {
          employeeID: 'employee-1',
          name: 'Ana',
          role: 'store_manager',
          effectiveFrom: '2026-01-01',
          effectiveTo: '2026-09-14',
        },
        {
          employeeID: 'employee-2',
          name: 'Luis',
          role: 'consignado',
          effectiveFrom: '2026-09-15',
          effectiveTo: null,
        },
      ],
      [],
      [],
    );

    expect(result[0]).toMatchObject({
      employeeCount: 1,
      presentCount: 1,
    });
    expect(result[0].employees[0].name).toBe('Ana');
    expect(result[1]).toMatchObject({
      employeeCount: 1,
      presentCount: 1,
    });
    expect(result[1].employees[0].name).toBe('Luis');
  });
});
