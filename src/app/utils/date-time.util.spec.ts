import { describe, expect, it } from 'vitest';
import { DateTimeUtil } from './date-time.util';

describe('DateTimeUtil sale date conversion', () => {
  it('interprets datetime-local values in the Colombia business timezone', () => {
    expect(DateTimeUtil.datetimeLocalToISO('2026-08-24T15:26')).toBe(
      '2026-08-24T20:26:00.000Z',
    );
  });

  it('converts stored UTC dates back to Colombia local time', () => {
    expect(DateTimeUtil.isoToDatetimeLocal('2026-08-24T20:26:00.000Z')).toBe(
      '2026-08-24T15:26',
    );
  });

  it('round-trips a Colombia datetime-local value', () => {
    const local = '2026-08-24T15:26';
    expect(DateTimeUtil.isoToDatetimeLocal(DateTimeUtil.datetimeLocalToISO(local))).toBe(local);
  });
});
