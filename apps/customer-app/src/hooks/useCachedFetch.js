import { useCallback, useEffect, useRef, useState } from 'react';
import { getCached, setCached } from '../utils/apiCache';

/**
 * SWR-style fetch: show cache instantly, revalidate in the background.
 *
 * @param {string|null|undefined} cacheKey
 * @param {() => Promise<any>} fetcherFn
 * @param {{ enabled?: boolean }} [options]
 * @returns {{ data: any, isLoading: boolean, isRefreshing: boolean, error: any, refresh: () => Promise<void> }}
 */
export function useCachedFetch(cacheKey, fetcherFn, options = {}) {
  const { enabled = true } = options;
  const fetcherRef = useRef(fetcherFn);
  fetcherRef.current = fetcherFn;

  const initial = cacheKey ? getCached(cacheKey) : null;
  const [data, setData] = useState(() => (initial ? initial.data : null));
  const [isLoading, setIsLoading] = useState(() => !initial && !!cacheKey && enabled);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Monotonic request id so late responses for a previous key are ignored.
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const runFetch = useCallback(async (key, { force = false, showRefreshing = false } = {}) => {
    if (!key) return;
    const requestId = ++requestIdRef.current;
    const cached = getCached(key);

    if (cached && !force) {
      // Cache hit: paint immediately, revalidate in background (no loader).
      if (mountedRef.current) {
        setData(cached.data);
        setIsLoading(false);
        setError(null);
      }
    } else if (!cached) {
      if (mountedRef.current) {
        setIsLoading(true);
        setError(null);
      }
    }

    if (showRefreshing && mountedRef.current) {
      setIsRefreshing(true);
    }

    try {
      const result = await fetcherRef.current();
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      setCached(key, result);
      setData(result);
      setError(null);
    } catch (err) {
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      // Keep cached data on background failure; only surface error on cold miss.
      const stillCached = getCached(key);
      if (!stillCached) {
        setError(err);
      }
    } finally {
      if (mountedRef.current && requestId === requestIdRef.current) {
        setIsLoading(false);
        if (showRefreshing) setIsRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!enabled || !cacheKey) {
      if (!enabled) {
        setIsLoading(false);
      }
      return undefined;
    }

    // Sync state from cache when key changes (instant paint).
    const cached = getCached(cacheKey);
    if (cached) {
      setData(cached.data);
      setIsLoading(false);
      setError(null);
    } else {
      setData(null);
      setIsLoading(true);
      setError(null);
    }

    runFetch(cacheKey, { force: false });
    return undefined;
  }, [cacheKey, enabled, runFetch]);

  const refresh = useCallback(async () => {
    if (!cacheKey || !enabled) return;
    await runFetch(cacheKey, { force: true, showRefreshing: true });
  }, [cacheKey, enabled, runFetch]);

  return { data, isLoading, isRefreshing, error, refresh };
}
