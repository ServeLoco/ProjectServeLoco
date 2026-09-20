import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

// The daytime scene (sun, cloud, birds) in the Home top bar runs from 7:00 AM
// to 6:00 PM India time, whatever timezone the phone is set to. India has no
// daylight saving, so IST is a fixed +5:30 from UTC.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const DAY_START_MS = 7 * 60 * MINUTE_MS;
const DAY_END_MS = 18 * 60 * MINUTE_MS;

const istMsOfDay = (nowMs) => (nowMs + IST_OFFSET_MS) % DAY_MS;

// 07:00 IST is day, 18:00 IST is already night.
export function isDaytimeIST(nowMs = Date.now()) {
  const ms = istMsOfDay(nowMs);
  return ms >= DAY_START_MS && ms < DAY_END_MS;
}

// Time left until the next 07:00 / 18:00 IST switch.
export function msUntilNextDayBoundary(nowMs = Date.now()) {
  const ms = istMsOfDay(nowMs);
  if (ms < DAY_START_MS) return DAY_START_MS - ms;
  if (ms < DAY_END_MS) return DAY_END_MS - ms;
  return DAY_MS - ms + DAY_START_MS;
}

// True during the day (7 AM – 6 PM IST). Flips by itself at the boundaries and
// re-checks when the app returns to the foreground (timers pause in the
// background).
export default function useIsDaytime() {
  const [isDay, setIsDay] = useState(() => isDaytimeIST());

  useEffect(() => {
    let timer = null;
    const sync = () => {
      if (timer) clearTimeout(timer);
      setIsDay(isDaytimeIST());
      timer = setTimeout(sync, msUntilNextDayBoundary() + 1000);
    };
    sync();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') sync();
    });
    return () => {
      if (timer) clearTimeout(timer);
      sub.remove();
    };
  }, []);

  return isDay;
}
