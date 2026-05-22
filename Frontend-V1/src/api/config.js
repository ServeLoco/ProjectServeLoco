const DEFAULT_API_BASE_URL = 'http://10.0.2.2:3000';

let apiBaseUrl = DEFAULT_API_BASE_URL;

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || '').replace(/\/+$/, '');
}

function getApiBaseUrl() {
  return normalizeBaseUrl(apiBaseUrl);
}

function setApiBaseUrl(nextBaseUrl) {
  apiBaseUrl = normalizeBaseUrl(nextBaseUrl || DEFAULT_API_BASE_URL);
}

export { DEFAULT_API_BASE_URL, getApiBaseUrl, setApiBaseUrl };
