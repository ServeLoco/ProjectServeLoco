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
  try { if (_logoutHandler) _logoutHandler(); } catch (_) {}
}

const REQUEST_TIMEOUT_MS = 15000;

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
    const isTimeout = timeout.signal?.aborted && !signal?.aborted;
    const timeoutMessage = __DEV__
      ? `Request timed out. Check that Backend-V1 is running and reachable from your phone at ${getApiBaseUrl()}.`
      : 'Request timed out. Check that Backend-V1 is running and reachable from your phone.';
    throw new ApiError(
      isTimeout
        ? timeoutMessage
        : 'Network request failed. Please try again.',
      {
      code: 'NETWORK_ERROR',
      details: error,
      isNetworkError: true,
      },
    );
  } finally {
    timeout.clear();
  }

  if (!response.ok) {
    // 401 means the server has rejected our token. Auto-logout so the UI
    // bounces the user to the Auth screen instead of letting screens render
    // with a token that no longer works. CustomerNavigator reacts to
    // isAuthenticated flipping back to false and re-renders Auth automatically.
    if (response.status === 401) {
      triggerLogout();
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

  return payload;
}

const apiClient = {
  delete: (path, options) => request(path, { ...options, method: 'DELETE' }),
  get: (path, options) => request(path, { ...options, method: 'GET' }),
  patch: (path, body, options) => request(path, { ...options, body, method: 'PATCH' }),
  post: (path, body, options) => request(path, { ...options, body, method: 'POST' }),
  request,
};

export { apiClient, request };
