import { getApiBaseUrl } from './config';

function getRealtimeBaseUrl() {
  const apiBaseUrl = getApiBaseUrl();

  try {
    const parsed = new URL(apiBaseUrl);
    parsed.pathname = parsed.pathname.replace(/\/api\/?$/, '');
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return String(apiBaseUrl || '').replace(/\/api\/?$/, '').replace(/\/+$/, '');
  }
}

export { getRealtimeBaseUrl };
