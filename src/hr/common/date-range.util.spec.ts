import { assertDateRange, rangesOverlap } from './date-range.util';

describe('date-range.util', () => {
  it('detects inclusive overlap only within the same date ranges', () => {
    expect(
      rangesOverlap('2026-09-01', '2026-09-03', '2026-09-03', '2026-09-05'),
    ).toBe(true);
    expect(
      rangesOverlap('2026-09-01', '2026-09-03', '2026-09-04', '2026-09-05'),
    ).toBe(false);
  });

  it('rejects an inverted range', () => {
    expect(() => assertDateRange('2026-09-04', '2026-09-03')).toThrow();
  });
});
