import { ApiError, getErrorMessage } from './apiError';
import { getApiBaseUrl } from './config';
import { getCustomerToken } from './sessionTokens';

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

  let response;
  let payload;

  try {
    response = await fetch(url, {
      method,
      headers: requestHeaders,
      body: buildBody(body),
      signal,
    });
    payload = await parseResponse(response);
  } catch (error) {
    throw new ApiError('Network request failed. Please try again.', {
      code: 'NETWORK_ERROR',
      details: error,
      isNetworkError: true,
    });
  }

  if (!response.ok) {
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
