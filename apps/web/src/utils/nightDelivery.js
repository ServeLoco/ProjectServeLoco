const DEFAULT_TIMEZONE = 'Asia/Kolkata';

function toMinutes(t) {
  if (t === null || t === undefined || t === '') return null;
  const str = typeof t === 'string' ? t : String(t);
  const parts = str.split(':').map(Number);
  if (!Number.isFinite(parts[0])) return null;
  return parts[0] * 60 + (Number.isFinite(parts[1]) ? parts[1] : 0);
}

function getNowMinutesInZone(date = new Date(), timeZone = DEFAULT_TIMEZONE) {
  try {
    const localised = new Date(date.toLocaleString('en-US', { timeZone }));
    return localised.getHours() * 60 + localised.getMinutes();
  } catch {
    const fallback = new Date(date);
    return fallback.getHours() * 60 + fallback.getMinutes();
  }
}

export function isInNightWindow(startTime, endTime, now = new Date(), timeZone = DEFAULT_TIMEZONE) {
  const startMin = toMinutes(startTime);
  const endMin = toMinutes(endTime);
  if (startMin === null || endMin === null) return false;
  const nowMinutes = getNowMinutesInZone(now, timeZone);
  if (startMin === endMin) return false;
  return startMin > endMin
    ? (nowMinutes >= startMin || nowMinutes <= endMin)
    : (nowMinutes >= startMin && nowMinutes <= endMin);
}

export function isNightWindowActive(settings = {}, now = new Date(), timeZone = DEFAULT_TIMEZONE) {
  if (!settings) return false;
  const start = settings.night_charge_start || settings.nightChargeStart;
  const end = settings.night_charge_end || settings.nightChargeEnd;
  if (!start || !end) return false;
  const charge = Number(settings.night_charge ?? settings.nightCharge ?? 0);
  if (!Number.isFinite(charge) || charge <= 0) return false;
  return isInNightWindow(start, end, now, timeZone);
}

export function isCodBlockedDuringNight(settings = {}, now = new Date(), timeZone = DEFAULT_TIMEZONE) {
  return isNightWindowActive(settings, now, timeZone);
}
