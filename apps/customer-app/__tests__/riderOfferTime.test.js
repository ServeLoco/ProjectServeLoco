import {
  remainingSecondsFromExpiresAt,
  formatCountdown,
} from '../src/utils/riderOfferTime';

describe('remainingSecondsFromExpiresAt', () => {
  const now = new Date('2026-07-12T12:00:00.000Z').getTime();

  it('returns 0 for null/invalid', () => {
    expect(remainingSecondsFromExpiresAt(null, now)).toBe(0);
    expect(remainingSecondsFromExpiresAt('', now)).toBe(0);
    expect(remainingSecondsFromExpiresAt('not-a-date', now)).toBe(0);
  });

  it('floors remaining seconds from server expiresAt', () => {
    const expires = new Date(now + 125_500).toISOString();
    expect(remainingSecondsFromExpiresAt(expires, now)).toBe(125);
  });

  it('never goes negative after expiry', () => {
    const expires = new Date(now - 5000).toISOString();
    expect(remainingSecondsFromExpiresAt(expires, now)).toBe(0);
  });

  it('handles Date objects', () => {
    expect(remainingSecondsFromExpiresAt(new Date(now + 60_000), now)).toBe(60);
  });
});

describe('formatCountdown', () => {
  it('formats m:ss', () => {
    expect(formatCountdown(0)).toBe('0:00');
    expect(formatCountdown(5)).toBe('0:05');
    expect(formatCountdown(65)).toBe('1:05');
    expect(formatCountdown(120)).toBe('2:00');
  });
});

/** UAT 14.6 — kill app / restart must not reset a fresh 2 minutes */
describe('UAT 14.6 app restart countdown continuity', () => {
  it('uses absolute expiresAt so reopening mid-offer shows remaining time only', () => {
    const started = Date.parse('2026-07-12T12:00:00.000Z');
    const expiresAt = new Date(started + 120_000).toISOString();
    // App killed at t+90s, reopened:
    const reopenAt = started + 90_000;
    expect(remainingSecondsFromExpiresAt(expiresAt, reopenAt)).toBe(30);
    // Not a fresh 120
    expect(remainingSecondsFromExpiresAt(expiresAt, reopenAt)).not.toBe(120);
  });
});
