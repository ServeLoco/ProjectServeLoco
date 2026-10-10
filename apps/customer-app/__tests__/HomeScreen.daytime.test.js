import { isDaytimeIST, msUntilNextDayBoundary, skyPhaseIST } from '../src/screens/customer/HomeScreen/useIsDaytime';

// IST is UTC+5:30, so 07:00 IST is 01:30 UTC and 17:00 IST is 11:30 UTC.
const atIst = (hour, minute = 0) => Date.UTC(2026, 8, 20, hour, minute) - 5.5 * 60 * 60 * 1000;

describe('Home top bar sky (day 7 AM – 5 PM, evening 5 – 7 PM, night after, IST)', () => {
  it('is night before 7 AM and day from 7:00 AM', () => {
    expect(skyPhaseIST(atIst(0, 0))).toBe('night');
    expect(skyPhaseIST(atIst(6, 59))).toBe('night');
    expect(skyPhaseIST(atIst(7, 0))).toBe('day');
  });

  it('is day until 4:59 PM, evening from 5:00 PM to 6:59 PM, night from 7:00 PM', () => {
    expect(skyPhaseIST(atIst(12, 0))).toBe('day');
    expect(skyPhaseIST(atIst(16, 59))).toBe('day');
    expect(skyPhaseIST(atIst(17, 0))).toBe('evening');
    expect(skyPhaseIST(atIst(18, 30))).toBe('evening');
    expect(skyPhaseIST(atIst(18, 59))).toBe('evening');
    expect(skyPhaseIST(atIst(19, 0))).toBe('night');
    expect(skyPhaseIST(atIst(23, 59))).toBe('night');
  });

  it('counts only the day window as daytime', () => {
    expect(isDaytimeIST(atIst(16, 59))).toBe(true);
    expect(isDaytimeIST(atIst(17, 0))).toBe(false);
    expect(isDaytimeIST(atIst(20, 0))).toBe(false);
  });

  it('follows IST no matter the phone timezone (uses UTC arithmetic only)', () => {
    // 01:30 UTC is 07:00 IST; 11:30 UTC is 17:00 IST.
    expect(skyPhaseIST(Date.UTC(2026, 8, 20, 1, 29))).toBe('night');
    expect(skyPhaseIST(Date.UTC(2026, 8, 20, 1, 30))).toBe('day');
    expect(skyPhaseIST(Date.UTC(2026, 8, 20, 11, 30))).toBe('evening');
  });

  it('counts down to the next switch', () => {
    const minute = 60 * 1000;
    expect(msUntilNextDayBoundary(atIst(6, 0))).toBe(60 * minute); // to 7:00
    expect(msUntilNextDayBoundary(atIst(16, 0))).toBe(60 * minute); // to 17:00
    expect(msUntilNextDayBoundary(atIst(18, 0))).toBe(60 * minute); // to 19:00
    expect(msUntilNextDayBoundary(atIst(23, 0))).toBe(8 * 60 * minute); // to 7:00 next day
  });
});
