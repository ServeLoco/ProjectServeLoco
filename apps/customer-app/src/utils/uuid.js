// uuid.js
// Tiny RFC-4122 v4 UUID generator. Avoids pulling in a `uuid` package.
// Works in Hermes/JSC without crypto polyfill.

/**
 * Returns a random RFC-4122 v4 UUID string, e.g.
 *   "f47ac10b-58cc-4372-a567-0e02b2c3d479"
 */
export function uuidv4() {
  // Prefer globalThis.crypto when present (modern Hermes / JSC).
  const c = (typeof globalThis !== 'undefined' && globalThis.crypto) || null;
  if (c && typeof c.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    c.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 1
    return bytesToUuid(bytes);
  }

  // Fallback: Math.random. Not cryptographically strong but sufficient
  // for client-side idempotency keys.
  let uuid = '';
  for (let i = 0; i < 32; i++) {
    if (i === 8 || i === 12 || i === 16 || i === 20) uuid += '-';
    const r = (Math.random() * 16) | 0;
    uuid += (i === 12 ? 4 : i === 16 ? (r & 0x3) | 0x8 : r).toString(16);
  }
  return uuid;
}

function bytesToUuid(bytes) {
  const hex = [];
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    hex.push((b + 0x100).toString(16).slice(1));
  }
  return (
    hex.slice(0, 4).join('') + '-' +
    hex.slice(4, 6).join('') + '-' +
    hex.slice(6, 8).join('') + '-' +
    hex.slice(8, 10).join('') + '-' +
    hex.slice(10, 16).join('')
  );
}
