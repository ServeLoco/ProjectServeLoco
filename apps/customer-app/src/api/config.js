import { NativeModules, Platform } from 'react-native';

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || '').replace(/\/+$/, '');
}

function getDevServerHost() {
  const scriptURL = NativeModules?.SourceCode?.scriptURL;
  const host = String(scriptURL || '').match(/^[^:]+:\/\/([^:/]+)/)?.[1];

  if (
    !host ||
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host.startsWith('169.254.')
  ) {
    return null;
  }

  return host;
}

function resolveDefaultApiBaseUrl() {
  const envBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;

  if (envBaseUrl) {
    return normalizeBaseUrl(envBaseUrl);
  }

  if (!__DEV__) {
    throw new Error('EXPO_PUBLIC_API_BASE_URL must be set for release builds.');
  }

  const devServerHost = getDevServerHost();

  if (devServerHost) {
    return `http://${devServerHost}:3000/api`;
  }

  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:3000/api';
  }

  return 'http://localhost:3000/api';
}

const DEFAULT_API_BASE_URL = resolveDefaultApiBaseUrl();
let apiBaseUrl = DEFAULT_API_BASE_URL;

function getApiBaseUrl() {
  return normalizeBaseUrl(apiBaseUrl);
}

function setApiBaseUrl(nextBaseUrl) {
  apiBaseUrl = normalizeBaseUrl(nextBaseUrl || DEFAULT_API_BASE_URL);
}

export { DEFAULT_API_BASE_URL, getApiBaseUrl, setApiBaseUrl };
