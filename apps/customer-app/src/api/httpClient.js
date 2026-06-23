import { ApiError, getErrorMessage } from './apiError';
import { getApiBaseUrl } from './config';
import { getCustomerToken } from './sessionTokens';

// Defer the auth-store import to break a require cycle: useAuthStore pulls in
// authApi, which pulls in this file. We only need the store at request time
// for the 401 -> logout path, so a lazy registration from App.js is fine.
let _logoutHandler = null;
export function setCustomerLogoutHandler(handler) {
  _logoutHandler = typeof handler === 'function' ? handler : null;
}
function triggerLogout() {
  try { if (_logoutHandler) _logoutHandler(); } catch (_) { /* ignore logout errors */ }
}

// 8s timeout — long enough to survive a sluggish 3G connection, short
// enough that the user doesn't sit staring at a spinner for 15s on a
// truly broken request. The error message (set in the catch below)
// nudges the user toward "network is slow" instead of "server is broken".
const REQUEST_TIMEOUT_MS = 8000;

// Auto-retry config. A flaky 5xx (502/503/504) is almost always transient —
// the server is alive but momentarily overloaded. We retry up to 2 times
// with exponential backoff (500ms → 1000ms) before giving up. We do NOT
// retry 4xx (those are client errors that won't fix themselves) or 401
// (those trigger logout; retrying is pointless).
const RETRYABLE_STATUSES = new Set([502, 503, 504, 0]); // 0 = network error
const MAX_RETRIES = 2;
const BASE_BACKOFF_MS = 500;

function isFormData(body) {
  return typeof FormData !== 'undefined' && body instanceof FormData;
}

async function parseResponse(response) {
  const contentType = response.headers?.get?.('content-type') || '';

  if (response.status === 204) return null;

  if (contentType.includes('application/json')) {
    return response.json();
  }

  const text = await response.text();
  return text || null;
}

async function buildHeaders({ auth, body, headers }) {
  const requestHeaders = {
    Accept: 'application/json',
    ...headers,
  };

  if (body !== undefined && body !== null && !isFormData(body)) {
    requestHeaders['Content-Type'] = 'application/json';
  }

  const token = auth === 'customer' ? await getCustomerToken() : null;

  if (token) {
    requestHeaders.Authorization = `Bearer ${token}`;
  }

  return requestHeaders;
}

function buildBody(body) {
  if (body === undefined || body === null) return undefined;
  return isFormData(body) ? body : JSON.stringify(body);
}

function createTimeoutSignal(signal) {
  if (typeof AbortController === 'undefined') {
    return { signal, clear: () => {} };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }

  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeoutId),
  };
}

async function request(path, options = {}) {
  const {
    auth = null,
    body,
    headers,
    method = 'GET',
    signal,
  } = options;

  const url = `${getApiBaseUrl()}${path}`;
  const requestHeaders = await buildHeaders({ auth, body, headers });

  // Auto-retry on 5xx / network errors. We re-create the timeout signal
  // on each attempt so the backoff sleep isn't eating into the next
  // attempt's window. We also respect a caller-supplied signal so the
  // user can cancel.
  let attempt = 0;
  let lastError = null;
  let lastResponse = null;

  while (attempt <= MAX_RETRIES) {
    const timeout = createTimeoutSignal(signal);
    let response;
    let payload;

    try {
      response = await fetch(url, {
        method,
        headers: requestHeaders,
        body: buildBody(body),
        signal: timeout.signal,
      });
      payload = await parseResponse(response);
    } catch (error) {
      lastError = error;
      timeout.clear();

      // If the caller aborted, surface that immediately — never retry.
      if (signal?.aborted) {
        throw new ApiError('Request cancelled.', { code: 'ABORTED', details: error });
      }

      // Two retry-worthy cases:
      //   (a) our own timeout fired (slow request, server reachable)
      //   (b) fetch() rejected with a network error (server unreachable)
      // Both deserve a retry; user-initiated cancellation does not.
      const isTimeout = timeout.signal?.aborted === true;
      const isNetworkError = !isTimeout;
      if (attempt < MAX_RETRIES && (isTimeout || isNetworkError)) {
        const backoff = BASE_BACKOFF_MS * Math.pow(2, attempt);
        // eslint-disable-next-line no-await-in-loop
        await sleep(backoff, signal);
        attempt += 1;
        continue;
      }
      const timeoutMessage = __DEV__
        ? `Request timed out. Check that Backend-V1 is running and reachable from your phone at ${getApiBaseUrl()}.`
        : 'Network is slow. Tap to retry.';
      throw new ApiError(
        isTimeout ? timeoutMessage : 'Network request failed. Please try again.',
        {
          code: 'NETWORK_ERROR',
          details: error,
          isNetworkError: true,
        },
      );
    }
    timeout.clear();

    if (response.ok) {
      return payload;
    }

    lastResponse = response;
    lastError = null;

    // 401 means the server has rejected our customer token. Auto-logout
    // so the UI bounces the user to the Auth screen instead of letting
    // screens render with a token that no longer works. CustomerNavigator
    // reacts to isAuthenticated flipping back to false and re-renders
    // Auth automatically.
    //
    // IMPORTANT: only trigger logout for customer-authed endpoints.
    // Public endpoints (login, signup, password-reset) also return 401
    // on bad credentials — we must NOT clobber a valid session in that
    // case.
    if (options.auth === 'customer' && response.status === 401) {
      triggerLogout();
    }

    // Retry on transient 5xx / network errors. We treat network failures
    // (status 0) and 502/503/504 as worth retrying; everything else is a
    // real error the user should see immediately.
    if (RETRYABLE_STATUSES.has(response.status) && attempt < MAX_RETRIES) {
      const backoff = BASE_BACKOFF_MS * Math.pow(2, attempt);
      // eslint-disable-next-line no-await-in-loop
      await sleep(backoff, signal);
      attempt += 1;
      continue;
    }

    throw new ApiError(
      getErrorMessage(payload, 'Request failed. Please try again.'),
      {
        code: payload?.code || 'HTTP_ERROR',
        details: payload?.details || payload?.errors || null,
        response: payload,
        status: response.status,
      },
    );
  }

  // Should never get here, but TypeScript-style safety net.
  if (lastResponse) {
    throw new ApiError(
      getErrorMessage(null, 'Request failed. Please try again.'),
      {
        code: 'HTTP_ERROR',
        status: lastResponse.status,
      },
    );
  }
  throw lastError || new ApiError('Request failed. Please try again.', { code: 'UNKNOWN' });
}

function sleep(ms, signal) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    if (signal) {
      const onAbort = () => {
        clearTimeout(timer);
        resolve();
      };
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

const apiClient = {
  delete: (path, options) => request(path, { ...options, method: 'DELETE' }),
  get: (path, options) => request(path, { ...options, method: 'GET' }),
  patch: (path, body, options) => request(path, { ...options, body, method: 'PATCH' }),
  post: (path, body, options) => request(path, { ...options, body, method: 'POST' }),
  request,
};

export { apiClient, request };
