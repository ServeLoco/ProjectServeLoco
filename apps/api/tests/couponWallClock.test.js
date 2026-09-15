/**
 * coupons.starts_at / ends_at are DATETIME — a naive wall clock the admin typed
 * in IST (<input type="datetime-local">), stored verbatim with no zone.
 *
 * mysql2 decodes DATETIME strings with the connection's `timezone` option, which
 * is UTC in production. So a coupon set to end 2026-09-20 23:59 came back as an
 * instant meaning 23:59 UTC — 05:29 IST the next morning — and the window ran
 * ~5h30m long. The admin edit form then redisplayed that shifted value and saved
 * it back, walking the window earlier on every edit.
 *
 * These tests reproduce the production case specifically: a Date built the way
 * mysql2 builds one when the connection zone is UTC. On a dev box (connection
 * zone IST) the bug is invisible, which is why it survived this long, so
 * asserting only against local behaviour would prove nothing.
 */

// Force the PRODUCTION driver zone for this file before anything reads config.
// On a dev box the connection zone is IST, which makes the bug vanish: a naive
// literal parsed by a host that is also IST lands on the right instant by
// accident. Pinning UTC here is what makes these tests actually reproduce prod
// — without it they pass just as happily against the broken code.
process.env.MYSQL_SESSION_TZ = 'Z';

const { storedWallClock, istInstantFromWallClock, STORED_TZ } = require('../src/utils/businessTime');
const coupons = require('../src/utils/coupons');

// What mysql2 hands back for the literal "2026-09-20 23:59:00" when the
// connection zone is UTC: an instant of 23:59Z.
const asDecodedByUtcDriver = (literal) => new Date(`${literal.replace(' ', 'T')}Z`);

describe('coupon DATETIME columns are IST wall clocks', () => {
  it('reads a UTC-decoded DATETIME back as the IST wall clock that was stored', () => {
    expect(STORED_TZ).toBe('+00:00'); // the env pin above actually took effect
    const fromDriver = asDecodedByUtcDriver('2026-09-20 23:59:00');

    // The bug in one line: the driver's instant is 23:59 UTC...
    expect(fromDriver.toISOString()).toBe('2026-09-20T23:59:00.000Z');
    // ...the literal behind it is the 23:59 the admin typed...
    expect(storedWallClock(fromDriver)).toBe('2026-09-20T23:59:00');
    // ...and 23:59 IST is 18:29Z, not 23:59Z.
    expect(istInstantFromWallClock(fromDriver).toISOString()).toBe('2026-09-20T18:29:00.000Z');
  });

  it('round-trips a naive literal through both helpers unchanged', () => {
    const literal = '2026-09-20T23:59:00';
    expect(storedWallClock(literal)).toBe(literal);
    expect(istInstantFromWallClock(literal).toISOString()).toBe('2026-09-20T18:29:00.000Z');
  });

  it('accepts the space-separated form MySQL returns', () => {
    expect(storedWallClock('2026-09-20 23:59:00')).toBe('2026-09-20T23:59:00');
  });

  it('accepts the datetime-local form the admin form submits (no seconds)', () => {
    expect(storedWallClock('2026-09-20T23:59')).toBe('2026-09-20T23:59:00');
  });

  it('leaves a string that names its own zone alone — that is a real instant', () => {
    // Not a naive wall clock, so it must not be reread as one.
    expect(istInstantFromWallClock('2026-09-20T18:29:00Z').toISOString())
      .toBe('2026-09-20T18:29:00.000Z');
  });

  it('returns null for empty / unparseable values rather than an Invalid Date', () => {
    for (const value of [null, undefined, '', 'not a date']) {
      expect(storedWallClock(value)).toBeNull();
      expect(istInstantFromWallClock(value)).toBeNull();
    }
  });
});

describe('isWithinDateWindow honours the IST window', () => {
  // Coupon runs until 2026-09-20 23:59 IST == 18:29Z.
  const coupon = {
    starts_at: asDecodedByUtcDriver('2026-09-01 00:00:00'),
    ends_at: asDecodedByUtcDriver('2026-09-20 23:59:00'),
  };

  it('allows a redemption just before the IST end', () => {
    // 23:58 IST
    expect(coupons.isWithinDateWindow(coupon, new Date('2026-09-20T18:28:00Z'))).toBe(true);
  });

  it('allows the inclusive end minute', () => {
    // 23:59:30 IST — still inside the final minute.
    expect(coupons.isWithinDateWindow(coupon, new Date('2026-09-20T18:29:30Z'))).toBe(true);
  });

  it('rejects once the IST end has passed', () => {
    // 00:31 IST the next day. Under the old UTC reading this was still "inside"
    // the window, which is exactly the 5h30m of extra redemptions.
    expect(coupons.isWithinDateWindow(coupon, new Date('2026-09-20T19:01:00Z'))).toBe(false);
  });

  it('rejects before the IST start', () => {
    // 2026-08-31 23:00 IST — before 2026-09-01 00:00 IST.
    expect(coupons.isWithinDateWindow(coupon, new Date('2026-08-31T17:30:00Z'))).toBe(false);
  });

  it('treats a null bound as open-ended', () => {
    expect(coupons.isWithinDateWindow({ starts_at: null, ends_at: null }, new Date())).toBe(true);
  });
});
