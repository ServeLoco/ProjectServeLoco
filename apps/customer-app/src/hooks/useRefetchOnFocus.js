import { useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';

/**
 * Re-runs `refetch` every time the screen comes back into view — a tab the
 * customer returns to, or a screen they navigate back to — so each page shows
 * fresh data when it is opened, not what it held when first mounted.
 *
 * Not on the first focus: the screen's own mount effect already loaded. Not
 * more often than `minIntervalMs`, so flicking between tabs doesn't refire.
 * The refetch should be quiet — keep what is on screen while it loads.
 *
 * @param {() => void} refetch
 * @param {{ minIntervalMs?: number, enabled?: boolean }} [options]
 */
export function useRefetchOnFocus(refetch, { minIntervalMs = 5000, enabled = true } = {}) {
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const hasFocusedRef = useRef(false);
  const lastRunRef = useRef(0);

  useFocusEffect(
    useCallback(() => {
      const now = Date.now();
      if (!hasFocusedRef.current) {
        hasFocusedRef.current = true;
        lastRunRef.current = now;
        return;
      }
      if (!enabledRef.current || now - lastRunRef.current < minIntervalMs) return;
      lastRunRef.current = now;
      refetchRef.current?.();
    }, [minIntervalMs]),
  );
}
