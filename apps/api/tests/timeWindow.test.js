const { isWithinTimeWindow } = require('../src/utils/timeWindow');

// IST is UTC+5:30, so an IST wall-clock time is that time minus 5h30m in UTC.
const istInstant = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  const utcMinutes = h * 60 + m - (5 * 60 + 30);
  const dayShift = utcMinutes < 0 ? -1 : 0;
  const wrapped = ((utcMinutes % 1440) + 1440) % 1440;
  const day = 19 + dayShift;
  const pad = (n) => String(n).padStart(2, '0');
  return new Date(`2026-06-${pad(day)}T${pad(Math.floor(wrapped / 60))}:${pad(wrapped % 60)}:00Z`);
};

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
    jest.setSystemTime(istInstant('12:00'));
    expect(isWithinTimeWindow('09:00:00', '18:00:00')).toBe(true);

    // Set current time to 08:30 (before 09:00 - 18:00)
    jest.setSystemTime(istInstant('08:30'));
    expect(isWithinTimeWindow('09:00:00', '18:00:00')).toBe(false);

    // Set current time to 18:30 (after 09:00 - 18:00)
    jest.setSystemTime(istInstant('18:30'));
    expect(isWithinTimeWindow('09:00:00', '18:00:00')).toBe(false);

    // Set current time to 18:00 (exclusive end)
    jest.setSystemTime(istInstant('18:00'));
    expect(isWithinTimeWindow('09:00:00', '18:00:00')).toBe(false);

    // Set current time to 09:00 (inclusive start)
    jest.setSystemTime(istInstant('09:00'));
    expect(isWithinTimeWindow('09:00:00', '18:00:00')).toBe(true);
  });

  test('handles cross-midnight time window correctly (e.g., 22:00 - 02:00)', () => {
    // Set current time to 23:00 (inside window)
    jest.setSystemTime(istInstant('23:00'));
    expect(isWithinTimeWindow('22:00:00', '02:00:00')).toBe(true);

    // Set current time to 01:00 (inside window)
    jest.setSystemTime(istInstant('01:00'));
    expect(isWithinTimeWindow('22:00:00', '02:00:00')).toBe(true);

    // Set current time to 02:00 (exclusive end)
    jest.setSystemTime(istInstant('02:00'));
    expect(isWithinTimeWindow('22:00:00', '02:00:00')).toBe(false);

    // Set current time to 12:00 (outside window)
    jest.setSystemTime(istInstant('12:00'));
    expect(isWithinTimeWindow('22:00:00', '02:00:00')).toBe(false);
  });
});
