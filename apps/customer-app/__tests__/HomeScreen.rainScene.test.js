import { normalizeSettings } from '../src/utils/apiMappers';

const fs = require('fs');
const path = require('path');

const homeSource = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'screens', 'customer', 'HomeScreen', 'HomeScreen.js'),
  'utf8',
);

describe('Home top bar rain scene', () => {
  it('reads the admin rain charge switch from the settings response (either casing, any truthy form)', () => {
    expect(normalizeSettings({ rain_charge_enabled: 1 }).rainChargeEnabled).toBe(true);
    expect(normalizeSettings({ rain_charge_enabled: true }).rainChargeEnabled).toBe(true);
    expect(normalizeSettings({ rainChargeEnabled: '1' }).rainChargeEnabled).toBe(true);
    expect(normalizeSettings({ rain_charge_enabled: 0 }).rainChargeEnabled).toBe(false);
    expect(normalizeSettings({ rain_charge_enabled: '0' }).rainChargeEnabled).toBe(false);
  });

  it('is off when the server does not send the switch', () => {
    expect(normalizeSettings({}).rainChargeEnabled).toBe(false);
  });

  // The rain scene must win over the clock-based day/night look.
  it('lets the rain scene override the time-based scene', () => {
    expect(homeSource).toMatch(/const isRainy = rainChargeEnabled === true;/);
    expect(homeSource).toMatch(/\{isRainy \? \(\s*<RainSky/);
    expect(homeSource).toMatch(/\) : isDaytime \? \(/);
  });
});
