import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

// The Home top bar follows India time, whatever timezone the phone is set to:
// day 7:00 AM – 5:00 PM, evening (sunset) 5:00 PM – 7:00 PM, night the rest.
// India has no daylight saving, so IST is a fixed +5:30 from UTC.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const DAY_START_MS = 7 * 60 * MINUTE_MS;
const EVENING_START_MS = 17 * 60 * MINUTE_MS;
const NIGHT_START_MS = 19 * 60 * MINUTE_MS;

const istMsOfDay = (nowMs) => (nowMs + IST_OFFSET_MS) % DAY_MS;

// 'day', 'evening' or 'night'. Each starts on its minute: 07:00 IST is day,
// 17:00 IST is evening, 19:00 IST is night.
export function skyPhaseIST(nowMs = Date.now()) {
  const ms = istMsOfDay(nowMs);
  if (ms >= DAY_START_MS && ms < EVENING_START_MS) return 'day';
  if (ms >= EVENING_START_MS && ms < NIGHT_START_MS) return 'evening';
  return 'night';
}

export function isDaytimeIST(nowMs = Date.now()) {
  return skyPhaseIST(nowMs) === 'day';
}

// Time left until the next 07:00 / 17:00 / 19:00 IST switch.
export function msUntilNextDayBoundary(nowMs = Date.now()) {
  const ms = istMsOfDay(nowMs);
  if (ms < DAY_START_MS) return DAY_START_MS - ms;
  if (ms < EVENING_START_MS) return EVENING_START_MS - ms;
  if (ms < NIGHT_START_MS) return NIGHT_START_MS - ms;
  return DAY_MS - ms + DAY_START_MS;
}

// The current sky phase. Flips by itself at the boundaries and re-checks when
// the app returns to the foreground (timers pause in the background).
export default function useSkyPhase() {
  const [phase, setPhase] = useState(() => skyPhaseIST());

  useEffect(() => {
    let timer = null;
    const sync = () => {
      if (timer) clearTimeout(timer);
      setPhase(skyPhaseIST());
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

  return phase;
}
