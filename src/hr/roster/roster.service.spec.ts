import { RosterEntry, selectEntriesForDate } from './roster.service';

function entry(overrides: Partial<RosterEntry>): RosterEntry {
  return {
    employeeID: 'employee-1',
    name: 'Ana',
    role: 'store_manager',
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
    ...overrides,
  };
}

describe('selectEntriesForDate', () => {
  it('collapses overlapping rows of the same employee into one', () => {
    const closing = entry({
      effectiveFrom: '2026-01-01',
      effectiveTo: '2026-09-15',
    });
    const rehired = entry({
      effectiveFrom: '2026-09-15',
      effectiveTo: null,
    });

    expect(selectEntriesForDate([closing, rehired], '2026-09-15')).toEqual([
      rehired,
    ]);
    expect(selectEntriesForDate([rehired, closing], '2026-09-15')).toEqual([
      rehired,
    ]);
  });

  it('prefers the entry with the most recent effectiveFrom when none is active', () => {
    const older = entry({
      effectiveFrom: '2026-01-01',
      effectiveTo: '2026-09-15',
    });
    const newer = entry({
      effectiveFrom: '2026-09-01',
      effectiveTo: '2026-09-20',
    });

    expect(selectEntriesForDate([older, newer], '2026-09-15')).toEqual([newer]);
    expect(selectEntriesForDate([newer, older], '2026-09-15')).toEqual([newer]);
  });

  it('does not collapse different employees', () => {
    const ana = entry({ employeeID: 'employee-1', name: 'Ana' });
    const luis = entry({ employeeID: 'employee-2', name: 'Luis' });

    expect(selectEntriesForDate([ana, luis], '2026-09-15')).toEqual([
      ana,
      luis,
    ]);
  });

  it('excludes rows that do not cover the requested date', () => {
    const future = entry({
      effectiveFrom: '2026-09-16',
      effectiveTo: null,
    });
    const past = entry({
      effectiveFrom: '2026-01-01',
      effectiveTo: '2026-09-14',
    });

    expect(selectEntriesForDate([future, past], '2026-09-15')).toEqual([]);
  });

  it('treats effectiveTo as inclusive', () => {
    const closed = entry({
      effectiveFrom: '2026-01-01',
      effectiveTo: '2026-09-15',
    });

    expect(selectEntriesForDate([closed], '2026-09-15')).toEqual([closed]);
  });

  it('preserves the original query order', () => {
    const ana = entry({ employeeID: 'employee-1', name: 'Ana' });
    const luis = entry({ employeeID: 'employee-2', name: 'Luis' });

    expect(
      selectEntriesForDate([ana, luis], '2026-09-15').map((item) => item.name),
    ).toEqual(['Ana', 'Luis']);
  });
});
