/**
 * The one place that knows what "today" and "right now" mean for this business.
 *
 * VillKro runs in India: every calendar day, every open/close window and every
 * report boundary is IST, on every machine, regardless of where the API process
 * or the MySQL server happens to be. Two different zones are involved and
 * confusing them is what caused the Orders page UTC/IST bug (commit 247109d)
 * and the rider-dispatch CONVERT_TZ regression:
 *
 *  - STORED_TZ  — the zone the TIMESTAMP/DATETIME columns were WRITTEN in.
 *                 That is whatever the MySQL session time_zone was at write
 *                 time: '+00:00' in production, usually IST on a dev box.
 *                 It is a property of the server, not a business choice, and
 *                 must never be "fixed" to IST — doing so reinterprets every
 *                 row already in the production database.
 *  - BUSINESS_TZ — IST. What a human means by "today's orders". This is the
 *                 only zone any number shown to an admin, shop owner, rider or
 *                 customer is ever expressed in.
 *
 * Reading a stored timestamp as a business day is therefore always
 * STORED_TZ -> BUSINESS_TZ, never one or the other alone.
 *
 * The SQL builders below inline the two zones as literals instead of binding
 * them as params. That is deliberate: the params form put three interchangeable
 * timezone strings in a row in every call site's array, and one call site that
 * bound two where the SQL wanted three took rider dispatch down completely
 * (countCompletedDeliveriesTodayBatch). Values are config-controlled, never
 * user input, and are validated against a strict charset at load, so there is
 * nothing to inject and nothing left to mis-order.
 */

const config = require('../config/env');

// Either a fixed UTC offset ("+05:30") or a bare IANA zone name
// ("Asia/Kolkata"). Both are legal CONVERT_TZ arguments; named zones need the
// server's timezone tables loaded, offsets always work, which is why the
// defaults are offsets. No quotes or spaces can survive this, so inlining the
// result into a query string is safe.
const TZ_RE = /^(?:[+-]\d{2}:\d{2}|[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)*)$/;

const assertTz = (value, name) => {
  if (typeof value !== 'string' || !TZ_RE.test(value)) {
    throw new Error(
      `[businessTime] ${name} must be a UTC offset like "+05:30" or an IANA zone `
      + `like "Asia/Kolkata", got ${JSON.stringify(value)}`
    );
  }
  return value;
};

const STORED_TZ = assertTz(config.MYSQL_SESSION_TZ_SQL, 'MYSQL_SESSION_TZ_SQL');
const BUSINESS_TZ = assertTz(config.BUSINESS_TZ, 'BUSINESS_TZ');

/**
 * SQL for the IST calendar date of a stored timestamp column.
 * `istDateOf('o.created_at')` -> DATE(CONVERT_TZ(o.created_at, '<stored>', '<ist>'))
 *
 * Note this is not sargable — it wraps the column, so an index on created_at
 * can't be used for the comparison. Every call site it replaces was already
 * wrapped in a bare DATE(), which was equally non-sargable, so no query plan
 * gets worse; they were just producing the wrong day.
 *
 * @param {string} column - a trusted column reference, never user input.
 */
const istExprOf = (column) => `CONVERT_TZ(${column}, '${STORED_TZ}', '${BUSINESS_TZ}')`;
const istDateOf = (column) => `DATE(${istExprOf(column)})`;

/**
 * SQL for today's IST calendar date. Anchored to UTC_TIMESTAMP() rather than
 * CURDATE()/NOW(), because those already read in the server's session zone —
 * using them here would re-apply the very shift this is correcting.
 */
const istNowExpr = () => `CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '${BUSINESS_TZ}')`;
const istToday = () => `DATE(${istNowExpr()})`;

/** `<column>` falls in the current IST ISO week / calendar month. */
const istIsThisWeek = (column) => `YEARWEEK(${istExprOf(column)}, 1) = YEARWEEK(${istNowExpr()}, 1)`;
const istIsThisMonth = (column) => (
  `YEAR(${istExprOf(column)}) = YEAR(${istNowExpr()}) `
  + `AND MONTH(${istExprOf(column)}) = MONTH(${istNowExpr()})`
);

/** `<column>`'s IST date equals today in IST. The common "today" filter. */
const istIsToday = (column) => `${istDateOf(column)} = ${istToday()}`;

/**
 * Minutes since IST midnight, for open/close and availability windows.
 * Uses the same shift-then-read-UTC-getters trick as reportPeriods.js so it
 * works for offset zones without pulling in a date library, and falls back to
 * Intl for named zones.
 */
const istNowMinutes = (now = new Date()) => {
  const offsetMatch = /^([+-])(\d{2}):(\d{2})$/.exec(BUSINESS_TZ);
  if (offsetMatch) {
    const sign = offsetMatch[1] === '-' ? -1 : 1;
    const offsetMinutes = sign * (Number(offsetMatch[2]) * 60 + Number(offsetMatch[3]));
    const shifted = new Date(now.getTime() + offsetMinutes * 60000);
    return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
  }
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: BUSINESS_TZ, hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return hour * 60 + minute;
};

/**
 * The IST wall-clock parts of an instant. One shift for offset zones (the same
 * trick reportPeriods.js uses), Intl for named ones, so callers never touch the
 * host's own timezone — which is UTC in the production container, not IST.
 */
const fixedOffsetMinutes = (tz) => {
  const match = /^([+-])(\d{2}):(\d{2})$/.exec(tz);
  if (!match) return null;
  const sign = match[1] === '-' ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3]));
};

/** Wall-clock parts of an instant, as read in `tz`. */
const zoneParts = (now, tz) => {
  const offsetMinutes = fixedOffsetMinutes(tz);
  if (offsetMinutes !== null) {
    const shifted = new Date(now.getTime() + offsetMinutes * 60000);
    return {
      year: shifted.getUTCFullYear(),
      month: shifted.getUTCMonth() + 1,
      day: shifted.getUTCDate(),
      hour: shifted.getUTCHours(),
      minute: shifted.getUTCMinutes(),
      second: shifted.getUTCSeconds(),
    };
  }
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(now);
  const get = (type) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: get('year'), month: get('month'), day: get('day'),
    hour: get('hour'), minute: get('minute'), second: get('second'),
  };
};

const istParts = (now = new Date()) => zoneParts(now, BUSINESS_TZ);

/** "YYYY-MM-DD" for the IST calendar day an instant falls in. */
const istDateKey = (now = new Date()) => {
  const { year, month, day } = istParts(now);
  const pad = (n) => String(n).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}`;
};

/** Hour-of-day 0-23 in IST — the bucket for the analytics active-hours grid. */
const istHour = (now = new Date()) => istParts(now).hour;

/**
 * Day of week in IST, 0 = Sunday, matching JS Date.getDay() so existing
 * bitmasks (coupons.active_days_mask) keep their meaning.
 */
const istDayOfWeek = (now = new Date()) => {
  const { year, month, day } = istParts(now);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
};

/** Milliseconds from `now` until the next IST occurrence of hour:minute. */
const msUntilNextIst = (hour, minute, now = new Date()) => {
  const current = istParts(now);
  const currentMinutes = current.hour * 60 + current.minute;
  const targetMinutes = hour * 60 + minute;
  const deltaMinutes = targetMinutes > currentMinutes
    ? targetMinutes - currentMinutes
    : targetMinutes - currentMinutes + 1440;
  // Seconds/ms of the current IST minute have already elapsed; subtract them so
  // the timer lands ON the target minute rather than up to 59s after it.
  const elapsedInMinute = (now.getTime() % 60000);
  return Math.max(1000, deltaMinutes * 60000 - elapsedInMinute);
};

/**
 * ── Naive wall-clock DATETIME columns ────────────────────────────────────
 *
 * Three columns are DATETIME, not TIMESTAMP: coupons.starts_at,
 * coupons.ends_at and orders.idempotency_key_created_at. MySQL stores a
 * DATETIME as literal characters with no zone attached, so unlike a TIMESTAMP
 * it carries no instant of its own — its meaning is whatever the writer
 * intended.
 *
 * For the coupon window that intent is IST: the admin form is an
 * <input type="datetime-local">, which submits the wall clock the admin typed
 * ("2026-09-20T23:59") and it is stored verbatim. But mysql2 decodes DATETIME
 * strings using the connection's `timezone` option — UTC in production — so it
 * handed back an instant meaning 23:59 UTC, i.e. 05:29 IST the next morning.
 * Coupon windows ran ~5h30m past when they were set to end, and the admin edit
 * form showed a different time than the one that had been saved.
 *
 * Fixed here rather than by rewriting the rows: the stored characters are
 * already exactly the IST wall clock that was intended, so nothing needs to
 * move. What was wrong is who gets to decide what those characters mean, and
 * the answer must not be the driver's connection setting.
 */

/** Recover the literal wall clock mysql2 decoded, as "YYYY-MM-DDTHH:MM:SS". */
const storedWallClock = (value) => {
  if (value === null || value === undefined || value === '') return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    // mysql2 built this Date by reading the literal in STORED_TZ, so reading
    // the same zone back off it returns those original characters.
    const p = zoneParts(value, STORED_TZ);
    const pad = (n) => String(n).padStart(2, '0');
    return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`;
  }

  const text = String(value).trim();
  // An explicit instant (trailing Z or ±HH:MM) is not a naive wall clock —
  // route it through Date so it is converted rather than read literally.
  if (/(?:Z|[+-]\d{2}:?\d{2})$/.test(text)) {
    const asDate = new Date(text);
    return Number.isNaN(asDate.getTime()) ? null : storedWallClock(asDate);
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(text);
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6] || '00'}`;
};

/** The absolute instant a naive IST wall clock refers to. */
const istInstantFromWallClock = (wallClock) => {
  // A string that names its own zone ("...Z", "...+05:30") is already an
  // absolute instant — it is not a naive wall clock and must not be reread as
  // one. Only a Date (which mysql2 built by misreading a naive DATETIME literal
  // through the connection zone) and a bare "YYYY-MM-DD HH:MM:SS" string get
  // reinterpreted.
  if (typeof wallClock === 'string' && /(?:Z|[+-]\d{2}:?\d{2})\s*$/.test(wallClock.trim())) {
    const explicit = new Date(wallClock.trim());
    return Number.isNaN(explicit.getTime()) ? null : explicit;
  }

  const text = storedWallClock(wallClock);
  if (!text) return null;
  const [datePart, timePart] = text.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute, second] = timePart.split(':').map(Number);
  const asIfUtc = Date.UTC(year, month - 1, day, hour, minute, second);

  const offsetMinutes = fixedOffsetMinutes(BUSINESS_TZ);
  if (offsetMinutes !== null) return new Date(asIfUtc - offsetMinutes * 60000);

  // Named zone: resolve its offset at roughly this instant, then correct.
  const probe = new Date(asIfUtc);
  const seen = zoneParts(probe, BUSINESS_TZ);
  const seenAsUtc = Date.UTC(
    seen.year, seen.month - 1, seen.day, seen.hour, seen.minute, seen.second
  );
  return new Date(asIfUtc - (seenAsUtc - probe.getTime()));
};

/**
 * Is the IST wall clock inside [from, until)? Both are "HH:MM" strings.
 * Missing either bound means "no window", i.e. always inside.
 * Handles windows that cross midnight (22:00 -> 02:00).
 */
const isWithinIstWindow = (from, until, now = new Date()) => {
  if (!from || !until) return true;
  const toMinutes = (value) => {
    const [h, m] = String(value).split(':').map(Number);
    if (!Number.isFinite(h)) return null;
    return h * 60 + (Number.isFinite(m) ? m : 0);
  };
  const start = toMinutes(from);
  const end = toMinutes(until);
  if (start === null || end === null) return true;
  if (start === end) return true; // no real window
  const current = istNowMinutes(now);
  return start < end
    ? current >= start && current < end
    : current >= start || current < end;
};

module.exports = {
  STORED_TZ,
  BUSINESS_TZ,
  istExprOf,
  istDateOf,
  istNowExpr,
  istToday,
  istIsToday,
  istIsThisWeek,
  istIsThisMonth,
  istNowMinutes,
  istParts,
  istDateKey,
  istHour,
  istDayOfWeek,
  msUntilNextIst,
  isWithinIstWindow,
  storedWallClock,
  istInstantFromWallClock,
};
