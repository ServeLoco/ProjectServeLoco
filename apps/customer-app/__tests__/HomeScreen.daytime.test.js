import { isDaytimeIST, msUntilNextDayBoundary } from '../src/screens/customer/HomeScreen/useIsDaytime';

// IST is UTC+5:30, so 07:00 IST is 01:30 UTC and 18:00 IST is 12:30 UTC.
const atIst = (hour, minute = 0) => Date.UTC(2026, 8, 20, hour, minute) - 5.5 * 60 * 60 * 1000;

describe('Home top bar daytime window (7 AM – 6 PM IST)', () => {
  it('is night before 7 AM and day from 7:00 AM', () => {
    expect(isDaytimeIST(atIst(0, 0))).toBe(false);
    expect(isDaytimeIST(atIst(6, 59))).toBe(false);
    expect(isDaytimeIST(atIst(7, 0))).toBe(true);
  });

  it('is day until 5:59 PM and night from 6:00 PM', () => {
    expect(isDaytimeIST(atIst(12, 0))).toBe(true);
    expect(isDaytimeIST(atIst(17, 59))).toBe(true);
    expect(isDaytimeIST(atIst(18, 0))).toBe(false);
    expect(isDaytimeIST(atIst(23, 59))).toBe(false);
  });

  it('follows IST no matter the phone timezone (uses UTC arithmetic only)', () => {
    // 01:30 UTC is 07:00 IST.
    expect(isDaytimeIST(Date.UTC(2026, 8, 20, 1, 29))).toBe(false);
    expect(isDaytimeIST(Date.UTC(2026, 8, 20, 1, 30))).toBe(true);
  });

  it('counts down to the next switch', () => {
    const minute = 60 * 1000;
    expect(msUntilNextDayBoundary(atIst(6, 0))).toBe(60 * minute); // to 7:00
    expect(msUntilNextDayBoundary(atIst(17, 0))).toBe(60 * minute); // to 18:00
    expect(msUntilNextDayBoundary(atIst(23, 0))).toBe(8 * 60 * minute); // to 7:00 next day
  });
});
