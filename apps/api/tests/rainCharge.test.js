const { calculateRainCharge } = require('../src/utils/rainCharge');

describe('calculateRainCharge', () => {
  test('returns the charge when enabled', () => {
    expect(calculateRainCharge({ rain_charge_enabled: true, rain_charge: 15 })).toBe(15);
  });
  test('returns 0 when disabled', () => {
    expect(calculateRainCharge({ rain_charge_enabled: false, rain_charge: 15 })).toBe(0);
  });
  test('returns 0 when enabled but charge is 0', () => {
    expect(calculateRainCharge({ rain_charge_enabled: true, rain_charge: 0 })).toBe(0);
  });
  test('returns 0 when settings are missing', () => {
    expect(calculateRainCharge({})).toBe(0);
    expect(calculateRainCharge()).toBe(0);
  });
  test('returns 0 for a non-finite charge', () => {
    expect(calculateRainCharge({ rain_charge_enabled: true, rain_charge: 'oops' })).toBe(0);
  });
});
