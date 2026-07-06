import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { addEventListener as addNetInfoListener } from '@react-native-community/netinfo';
import { getApiBaseUrl } from '../api/config';

/**
 * useNetworkStatus
 * Lightweight online/offline detection for the customer app.
 *
 * Approach:
 *   1. Subscribe to NetInfo for device-level connectivity (isConnected) so
 *      we can distinguish "no network at all" from "network up but server
 *      unreachable".
 *   2. Periodically ping a lightweight endpoint to confirm the server is
 *      reachable. The ping is cheap (HEAD /ping) and throttled.
 *   3. Treat consecutive ping failures as "offline"; a single success clears
 *      it.
 *
 * Returns:
 *   { isOnline: boolean, isReachable: boolean, isDeviceOffline: boolean,
 *     lastCheckedAt: number|null }
 */
const DEFAULT_CHECK_INTERVAL_MS = 30 * 1000;

export function useNetworkStatus({
  checkIntervalMs = DEFAULT_CHECK_INTERVAL_MS,
  healthPath = '/ping',
  failureThreshold = 2,
} = {}) {
  // Best-effort: try the navigator.onLine hint when present. It works on web
  // and is a partial signal on React Native. We treat it as a hint, not truth.
  const initialOnline =
    typeof globalThis !== 'undefined' &&
    typeof globalThis.navigator !== 'undefined' &&
    typeof globalThis.navigator.onLine === 'boolean'
      ? globalThis.navigator.onLine
      : true;
  const [isReachable, setIsReachable] = useState(true);
  const [lastCheckedAt, setLastCheckedAt] = useState(null);
  const [isDeviceOffline, setIsDeviceOffline] = useState(false);
  const consecutiveFailuresRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    const unsubscribe = addNetInfoListener(state => {
      setIsDeviceOffline(!state.isConnected);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      if (cancelled) return;
      const baseUrl = getApiBaseUrl();
      if (!baseUrl) {
        // No base URL configured — we can't ping. Stay optimistic.
        return;
      }
      // The API base URL ends in '/api' (e.g. https://api.serveloco.app/api).
      // The health endpoint is mounted at the root, NOT under /api
      // (see apps/api/src/app.js:114 — `app.get('/health', ...)`).
      // Strip the trailing /api so we ping the real health endpoint;
      // otherwise we always 404 and falsely report the user as offline.
      const rootBaseUrl = baseUrl.replace(/\/api\/?$/, '');
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 4000);
        const res = await fetch(`${rootBaseUrl}${healthPath}`, {
          method: 'HEAD',
          signal: ctrl.signal,
        });
        clearTimeout(timer);
        if (!mountedRef.current) return;
        if (res.ok) {
          consecutiveFailuresRef.current = 0;
          setIsReachable(true);
        } else {
          consecutiveFailuresRef.current += 1;
          if (consecutiveFailuresRef.current >= failureThreshold) setIsReachable(false);
        }
        setLastCheckedAt(Date.now());
      } catch (_) {
        if (!mountedRef.current) return;
        consecutiveFailuresRef.current += 1;
        if (consecutiveFailuresRef.current >= failureThreshold) setIsReachable(false);
        setLastCheckedAt(Date.now());
      }
    };

    // Kick off a check on app start and on every interval / foreground.
    check();
    const id = setInterval(check, checkIntervalMs);
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') check();
    });
    return () => {
      cancelled = true;
      clearInterval(id);
      sub.remove();
    };
  }, [checkIntervalMs, healthPath, failureThreshold]);

  // isOnline reflects whether the server is actually reachable from this
  // device. We deliberately ignore navigator.onLine because on React Native
  // it's unreliable (often returns false even with working network) and
  // would falsely show the offline banner forever.
  return { isOnline: isReachable, isReachable, isDeviceOffline, lastCheckedAt };
}
