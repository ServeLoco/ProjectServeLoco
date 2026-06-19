const { isWithinTimeWindow } = require('../src/utils/timeWindow');

describe('isWithinTimeWindow helper logic', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('returns true if time window parameters are null or empty', () => {
    expect(isWithinTimeWindow(null, null)).toBe(true);
    expect(isWithinTimeWindow('', '')).toBe(true);
    expect(isWithinTimeWindow(undefined, undefined)).toBe(true);
  });

  test('returns true if start and end times are identical', () => {
    expect(isWithinTimeWindow('09:00:00', '09:00:00')).toBe(true);
  });

  test('handles same-day time window correctly (e.g., 09:00 - 18:00)', () => {
    // Set current time to 12:00 (inside 09:00 - 18:00)
    jest.setSystemTime(new Date('2026-06-19T12:00:00'));
    expect(isWithinTimeWindow('09:00:00', '18:00:00')).toBe(true);

    // Set current time to 08:30 (before 09:00 - 18:00)
    jest.setSystemTime(new Date('2026-06-19T08:30:00'));
    expect(isWithinTimeWindow('09:00:00', '18:00:00')).toBe(false);

    // Set current time to 18:30 (after 09:00 - 18:00)
    jest.setSystemTime(new Date('2026-06-19T18:30:00'));
    expect(isWithinTimeWindow('09:00:00', '18:00:00')).toBe(false);

    // Set current time to 18:00 (exclusive end)
    jest.setSystemTime(new Date('2026-06-19T18:00:00'));
    expect(isWithinTimeWindow('09:00:00', '18:00:00')).toBe(false);

    // Set current time to 09:00 (inclusive start)
    jest.setSystemTime(new Date('2026-06-19T09:00:00'));
    expect(isWithinTimeWindow('09:00:00', '18:00:00')).toBe(true);
  });

  test('handles cross-midnight time window correctly (e.g., 22:00 - 02:00)', () => {
    // Set current time to 23:00 (inside window)
    jest.setSystemTime(new Date('2026-06-19T23:00:00'));
    expect(isWithinTimeWindow('22:00:00', '02:00:00')).toBe(true);

    // Set current time to 01:00 (inside window)
    jest.setSystemTime(new Date('2026-06-19T01:00:00'));
    expect(isWithinTimeWindow('22:00:00', '02:00:00')).toBe(true);

    // Set current time to 02:00 (exclusive end)
    jest.setSystemTime(new Date('2026-06-19T02:00:00'));
    expect(isWithinTimeWindow('22:00:00', '02:00:00')).toBe(false);

    // Set current time to 12:00 (outside window)
    jest.setSystemTime(new Date('2026-06-19T12:00:00'));
    expect(isWithinTimeWindow('22:00:00', '02:00:00')).toBe(false);
  });
});
