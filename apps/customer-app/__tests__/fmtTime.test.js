import { fmtTime } from '../src/utils/fmtTime';

describe('fmtTime', () => {
  test('returns empty string for null/undefined/empty', () => {
    expect(fmtTime(null)).toBe('');
    expect(fmtTime(undefined)).toBe('');
    expect(fmtTime('')).toBe('');
  });

  test('formats HH:MM:SS strings to HH:MM', () => {
    expect(fmtTime('09:00:00')).toBe('09:00');
    expect(fmtTime('18:30:00')).toBe('18:30');
  });

  test('leaves HH:MM strings unchanged', () => {
    expect(fmtTime('09:00')).toBe('09:00');
  });

  test('handles Date objects', () => {
    // Use a local-time Date to avoid timezone surprises in CI
    const d = new Date(2026, 5, 19, 9, 0, 0); // 19 June 2026 09:00 local
    expect(fmtTime(d)).toBe('09:00');

    const d2 = new Date(2026, 5, 19, 18, 30, 0);
    expect(fmtTime(d2)).toBe('18:30');
  });

  test('handles invalid Date without throwing', () => {
    const bad = new Date('not a date');
    // NaN-time Date: falls through to String(v).slice(0,5)
    expect(() => fmtTime(bad)).not.toThrow();
  });

  test('truncates anything else to first 5 chars', () => {
    expect(fmtTime(1234567)).toBe('12345');
  });
});
