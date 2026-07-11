/**
 * Server-authoritative remaining time for a rider offer.
 * Always derive from expiresAt — never restart a fresh 120s on mount.
 */

/**
 * @param {string|Date|number|null|undefined} expiresAt
 * @param {number} [nowMs]
 * @returns {number} seconds remaining, floored, never negative
 */
export function remainingSecondsFromExpiresAt(expiresAt, nowMs = Date.now()) {
  if (expiresAt == null || expiresAt === '') return 0;
  const end = new Date(expiresAt).getTime();
  if (!Number.isFinite(end)) return 0;
  return Math.max(0, Math.floor((end - nowMs) / 1000));
}

/**
 * @param {number} totalSeconds
 * @returns {string} m:ss
 */
export function formatCountdown(totalSeconds) {
  const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}
