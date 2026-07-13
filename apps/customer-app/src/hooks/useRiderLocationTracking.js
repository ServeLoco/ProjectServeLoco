import { useEffect, useRef } from 'react';
import * as Location from 'expo-location';
import { riderApi } from '../api/riderApi';

/**
 * Foreground-only GPS watch while the rider has an active assignment.
 * Ping cadence: 10s / 20m (locked §4.6). Fire-and-forget updates.
 */
export function useRiderLocationTracking(activeAssignment) {
  const subscriptionRef = useRef(null);
  const startingRef = useRef(false);
  // Depend on id/truthiness so fetchAll() object identity churn does not restart GPS.
  const assignmentKey = activeAssignment
    ? String(activeAssignment.id ?? activeAssignment.orderId ?? activeAssignment.order_id ?? 'active')
    : null;

  useEffect(() => {
    let cancelled = false;

    async function stopWatch() {
      if (subscriptionRef.current) {
        try {
          subscriptionRef.current.remove();
        } catch (_) { /* ignore */ }
        subscriptionRef.current = null;
      }
      startingRef.current = false;
    }

    async function startWatch() {
      if (subscriptionRef.current || startingRef.current) return;
      startingRef.current = true;

      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (cancelled || status !== 'granted') {
          startingRef.current = false;
          return;
        }

        const sub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 10000,
            distanceInterval: 20,
          },
          (position) => {
            const coords = position?.coords;
            if (!coords) return;
            riderApi
              .updateLocation(coords.latitude, coords.longitude)
              .catch(() => {});
          }
        );

        if (cancelled) {
          try {
            sub.remove();
          } catch (_) { /* ignore */ }
          startingRef.current = false;
          return;
        }

        subscriptionRef.current = sub;
      } catch (_) {
        // Permission denied or location unavailable — no-op silently.
      } finally {
        startingRef.current = false;
      }
    }

    if (assignmentKey) {
      startWatch();
    } else {
      stopWatch();
    }

    return () => {
      cancelled = true;
      stopWatch();
    };
  }, [assignmentKey]);
}
