import { describe, expect, it } from 'vitest';
import { DateTimeUtil } from './date-time.util';

describe('DateTimeUtil sale date conversion', () => {
  it('interprets an event end without an offset as UTC, not browser local time', () => {
    const end = DateTimeUtil.parseStoredDate('2026-09-07T04:00:00');
    expect(end.toISOString()).toBe('2026-09-07T04:00:00.000Z');
    expect(end.getTime()).toBeLessThan(new Date('2026-09-06T23:01:00-05:00').getTime());
  });

  it('preserves explicit offsets when comparing event end times', () => {
    expect(DateTimeUtil.parseStoredDate('2026-09-06T23:00:00-05:00').getTime()).toBe(
      DateTimeUtil.parseStoredDate('2026-09-07T04:00:00Z').getTime(),
    );
  });

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
