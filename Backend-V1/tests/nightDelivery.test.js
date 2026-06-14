const {
  toMinutes,
  isInNightWindow,
  isNightWindowActive,
  calculateNightCharge,
  isCodBlockedDuringNight,
} = require('../src/utils/nightDelivery');

function atIst(hour, minute = 0) {
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const utc = new Date(Date.UTC(2024, 5, 15, hour, minute));
  return new Date(utc.getTime() - istOffsetMs);
}

describe('toMinutes', () => {
  test('parses HH:MM:SS', () => {
    expect(toMinutes('21:30:00')).toBe(21 * 60 + 30);
  });
  test('parses HH:MM', () => {
    expect(toMinutes('07:15')).toBe(7 * 60 + 15);
  });
  test('returns null for invalid input', () => {
    expect(toMinutes(null)).toBeNull();
    expect(toMinutes('')).toBeNull();
    expect(toMinutes('not a time')).toBeNull();
  });
});

describe('isInNightWindow (overnight 21:00 → 07:00)', () => {
  const start = '21:00:00';
  const end = '07:00:00';

  test('matches 23:00 IST', () => {
    expect(isInNightWindow(start, end, atIst(23))).toBe(true);
  });
  test('matches 02:00 IST (after midnight)', () => {
    expect(isInNightWindow(start, end, atIst(2))).toBe(true);
  });
  test('matches 06:59 IST (just before end)', () => {
    expect(isInNightWindow(start, end, atIst(6, 59))).toBe(true);
  });
  test('matches 07:00 IST (end is inclusive, matches original behavior)', () => {
    expect(isInNightWindow(start, end, atIst(7))).toBe(true);
  });
  test('does not match 07:01 IST', () => {
    expect(isInNightWindow(start, end, atIst(7, 1))).toBe(false);
  });
  test('does not match 12:00 IST', () => {
    expect(isInNightWindow(start, end, atIst(12))).toBe(false);
  });
  test('does not match 20:59 IST (just before start)', () => {
    expect(isInNightWindow(start, end, atIst(20, 59))).toBe(false);
  });
  test('matches 21:00 IST (start is inclusive)', () => {
    expect(isInNightWindow(start, end, atIst(21))).toBe(true);
  });
});

describe('isInNightWindow (same-day 14:00 → 18:00)', () => {
  test('matches 15:00 IST', () => {
    expect(isInNightWindow('14:00:00', '18:00:00', atIst(15))).toBe(true);
  });
  test('does not match 13:59 IST', () => {
    expect(isInNightWindow('14:00:00', '18:00:00', atIst(13, 59))).toBe(false);
  });
  test('matches 18:00 IST (end inclusive)', () => {
    expect(isInNightWindow('14:00:00', '18:00:00', atIst(18))).toBe(true);
  });
  test('does not match 19:00 IST', () => {
    expect(isInNightWindow('14:00:00', '18:00:00', atIst(19))).toBe(false);
  });
});

describe('isInNightWindow edge cases', () => {
  test('start === end → always false', () => {
    expect(isInNightWindow('10:00:00', '10:00:00', atIst(10))).toBe(false);
    expect(isInNightWindow('10:00:00', '10:00:00', atIst(15))).toBe(false);
  });
  test('null start or end → false', () => {
    expect(isInNightWindow(null, '07:00:00', atIst(2))).toBe(false);
    expect(isInNightWindow('21:00:00', undefined, atIst(2))).toBe(false);
  });
});

describe('isNightWindowActive', () => {
  const baseSettings = {
    night_charge: 50,
    night_charge_start: '21:00:00',
    night_charge_end: '07:00:00',
  };

  test('returns true inside the window when charge > 0', () => {
    expect(isNightWindowActive(baseSettings, atIst(2))).toBe(true);
  });
  test('returns false outside the window', () => {
    expect(isNightWindowActive(baseSettings, atIst(12))).toBe(false);
  });
  test('returns false when charge is 0', () => {
    expect(isNightWindowActive({ ...baseSettings, night_charge: 0 }, atIst(2))).toBe(false);
  });
  test('returns false when times are missing', () => {
    expect(isNightWindowActive({ night_charge: 50 }, atIst(2))).toBe(false);
  });
});

describe('calculateNightCharge', () => {
  const settings = {
    night_charge: 50,
    night_charge_start: '21:00:00',
    night_charge_end: '07:00:00',
  };
  test('returns the charge during the window', () => {
    expect(calculateNightCharge(settings, atIst(23))).toBe(50);
  });
  test('returns 0 outside the window', () => {
    expect(calculateNightCharge(settings, atIst(12))).toBe(0);
  });
});

describe('isCodBlockedDuringNight', () => {
  const settings = {
    night_charge: 50,
    night_charge_start: '21:00:00',
    night_charge_end: '07:00:00',
  };
  test('blocks COD inside the window', () => {
    expect(isCodBlockedDuringNight(settings, atIst(2))).toBe(true);
  });
  test('does not block COD outside the window', () => {
    expect(isCodBlockedDuringNight(settings, atIst(12))).toBe(false);
  });
});
