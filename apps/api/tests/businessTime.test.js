/**
 * businessTime is the single definition of "today" and "right now" for the
 * platform, so these tests pin the two things that kept going wrong:
 *
 *  1. Every SQL day boundary converts STORED_TZ -> IST. Reading a stored
 *     timestamp in the DB server's own zone (CURDATE(), DATE(col)) filed every
 *     00:00-05:30 IST order under the previous day in production.
 *  2. Every wall-clock read is IST regardless of the host's TZ. The production
 *     container sets no TZ and runs on UTC, so anything built on
 *     `new Date().getHours()` was 5h30m out.
 *
 * Nothing here may depend on the machine running it — that is the whole point,
 * so every instant below is an explicit UTC one.
 */

const {
  BUSINESS_TZ,
  istExprOf,
  istDateOf,
  istToday,
  istIsToday,
  istIsThisWeek,
  istIsThisMonth,
  istNowMinutes,
  istParts,
  istDateKey,
  istHour,
  msUntilNextIst,
  isWithinIstWindow,
} = require('../src/utils/businessTime');

// 2026-09-14T20:30:00Z is 2026-09-15 02:00 IST — inside the 00:00-05:30 IST
// window that every one of these bugs got wrong.
const LATE_NIGHT_UTC = new Date('2026-09-14T20:30:00Z');
// 2026-09-15T05:00:00Z is 2026-09-15 10:30 IST — same IST day, unambiguous.
const MORNING_UTC = new Date('2026-09-15T05:00:00Z');

describe('businessTime SQL builders', () => {
  it('defaults the business zone to IST', () => {
    expect(BUSINESS_TZ).toBe('+05:30');
  });

  it('converts a stored column into the business zone, never reading it raw', () => {
    const sql = istExprOf('o.created_at');
    expect(sql).toMatch(/^CONVERT_TZ\(o\.created_at, '.+', '\+05:30'\)$/);
    expect(istDateOf('o.created_at')).toBe(`DATE(${sql})`);
  });

  it("anchors today to UTC_TIMESTAMP, not CURDATE()/NOW()", () => {
    // CURDATE() and NOW() already read in the server's session zone; using
    // either here would re-apply the shift these helpers exist to remove.
    expect(istToday()).toContain('UTC_TIMESTAMP()');
    expect(istToday()).not.toContain('CURDATE()');
    expect(istToday()).not.toMatch(/\bNOW\(\)/);
  });

  it('builds today / this week / this month off the same converted column', () => {
    expect(istIsToday('created_at')).toBe(`${istDateOf('created_at')} = ${istToday()}`);
    expect(istIsThisWeek('created_at')).toContain(`YEARWEEK(${istExprOf('created_at')}, 1)`);
    expect(istIsThisMonth('created_at')).toContain(`YEAR(${istExprOf('created_at')})`);
    expect(istIsThisMonth('created_at')).toContain(`MONTH(${istExprOf('created_at')})`);
  });

  it('emits no bound placeholders — the zones are inlined', () => {
    // The params form is what broke rider dispatch: three interchangeable
    // timezone strings in a row, and one call site bound two of the three.
    for (const sql of [istIsToday('c'), istIsThisWeek('c'), istIsThisMonth('c')]) {
      expect(sql).not.toContain('?');
    }
  });
});

describe('businessTime wall clock (host TZ must not matter)', () => {
  it('reads IST parts from an absolute instant', () => {
    expect(istParts(LATE_NIGHT_UTC)).toMatchObject({
      year: 2026, month: 9, day: 15, hour: 2, minute: 0,
    });
  });

  it('keys the IST calendar day, not the UTC one', () => {
    // The bug in one line: this instant is still 2026-09-14 in UTC.
    expect(LATE_NIGHT_UTC.toISOString().slice(0, 10)).toBe('2026-09-14');
    expect(istDateKey(LATE_NIGHT_UTC)).toBe('2026-09-15');
    expect(istDateKey(MORNING_UTC)).toBe('2026-09-15');
  });

  it('buckets the analytics active-hours grid on the IST hour', () => {
    expect(istHour(LATE_NIGHT_UTC)).toBe(2);
    expect(istHour(MORNING_UTC)).toBe(10);
  });

  it('counts minutes since IST midnight', () => {
    expect(istNowMinutes(LATE_NIGHT_UTC)).toBe(120);
    expect(istNowMinutes(MORNING_UTC)).toBe(10 * 60 + 30);
  });

  it('schedules the next IST occurrence of a time, wrapping past midnight', () => {
    // 02:00 IST -> next 00:05 IST is 22h05m away.
    expect(msUntilNextIst(0, 5, LATE_NIGHT_UTC)).toBe((22 * 60 + 5) * 60000);
    // 02:00 IST -> 03:00 IST is 1h away, same day.
    expect(msUntilNextIst(3, 0, LATE_NIGHT_UTC)).toBe(60 * 60000);
  });
});

describe('isWithinIstWindow', () => {
  it('treats a missing bound as no window at all', () => {
    expect(isWithinIstWindow(null, '18:00', MORNING_UTC)).toBe(true);
    expect(isWithinIstWindow('09:00', '', MORNING_UTC)).toBe(true);
    expect(isWithinIstWindow('09:00', '09:00', MORNING_UTC)).toBe(true);
  });

  it('compares against the IST clock, not UTC', () => {
    // 10:30 IST is inside 09:00-18:00. The same instant is 05:00 UTC, which is
    // NOT — that difference is the production bug this replaced.
    expect(isWithinIstWindow('09:00', '18:00', MORNING_UTC)).toBe(true);
    expect(MORNING_UTC.getUTCHours()).toBeLessThan(9);
  });

  it('is inclusive of the start and exclusive of the end', () => {
    const nineIst = new Date('2026-09-15T03:30:00Z');
    const sixIst = new Date('2026-09-15T12:30:00Z');
    expect(isWithinIstWindow('09:00', '18:00', nineIst)).toBe(true);
    expect(isWithinIstWindow('09:00', '18:00', sixIst)).toBe(false);
  });

  it('handles a window crossing midnight', () => {
    expect(isWithinIstWindow('22:00', '02:00', LATE_NIGHT_UTC)).toBe(false); // 02:00 exact end
    expect(isWithinIstWindow('22:00', '03:00', LATE_NIGHT_UTC)).toBe(true); // 02:00 inside
    expect(isWithinIstWindow('22:00', '02:00', MORNING_UTC)).toBe(false); // 10:30 outside
  });

  it('accepts HH:MM:SS as MySQL TIME columns return it', () => {
    expect(isWithinIstWindow('09:00:00', '18:00:00', MORNING_UTC)).toBe(true);
  });
});
