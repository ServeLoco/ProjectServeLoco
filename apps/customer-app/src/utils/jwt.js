// jwt.js
// Lightweight JWT helpers for client-side checks. Does NOT replace server
// validation — the server is still the source of truth — but it lets the app
// avoid launching into the home screen with a token that is obviously expired
// (decoded `exp` claim in the past) before the first API call even fires.

/**
 * Decode a JWT payload without verifying the signature. Safe for client-side
 * "is this even plausible?" checks; never use for auth decisions on the server.
 */
export function decodeJwtPayload(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    // base64url -> base64
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    // add padding if needed
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    // RN's atob may not exist on Hermes; use a manual decoder for safety.
    const json = base64Decode(padded);
    return JSON.parse(json);
  } catch (_) {
    return null;
  }
}

/** Returns the `exp` claim (seconds since epoch) or null if it can't be read. */
export function getJwtExpiry(token) {
  const payload = decodeJwtPayload(token);
  return payload && typeof payload.exp === 'number' ? payload.exp : null;
}

/**
 * Returns true if the token is either missing, malformed, or has an `exp`
 * claim earlier than `now` (with `leewaySeconds` of early-expire, default 30s).
 * The leeway causes the client to treat the token as expired slightly BEFORE
 * the server does, preventing race conditions where the client sends a request
 * with a token that expires during transit.
 */
export function isJwtExpired(token, leewaySeconds = 30) {
  const exp = getJwtExpiry(token);
  if (exp == null) return true; // can't read -> treat as expired (safer)
  const nowSeconds = Math.floor(Date.now() / 1000);
  return nowSeconds >= exp - leewaySeconds;
}

function base64Decode(input) {
  // Build a lookup of base64 chars. RN's global atob exists on newer runtimes
  // but not on every device — fall back to a manual decoder.
  if (typeof globalThis.atob === 'function') {
    return globalThis.atob(input);
  }
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let output = '';
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charAt(i);
    if (ch === '=') break;
    const idx = chars.indexOf(ch);
    if (idx < 0) continue;
    buffer = (buffer << 6) | idx;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }
  return output;
}
