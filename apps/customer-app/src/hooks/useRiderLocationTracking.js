import { useEffect, useRef } from 'react';
import * as Location from 'expo-location';
import { riderApi } from '../api/riderApi';
import { RIDER_WATCH_OPTIONS, shouldSendPing } from '../utils/riderTracking';

/**
 * Foreground-only GPS watch while the rider has an active assignment.
 * Samples every ~3s but only sends a ping once the rider has moved 150 m
 * or turned sharply since the last sent point. Fire-and-forget updates.
 */
export function useRiderLocationTracking(activeAssignment) {
  const subscriptionRef = useRef(null);
  const startingRef = useRef(false);
  const lastSentRef = useRef(null);
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
          RIDER_WATCH_OPTIONS,
          (position) => {
            const coords = position?.coords;
            if (!coords) return;
            const next = {
              latitude: coords.latitude,
              longitude: coords.longitude,
              heading: coords.heading,
              at: Date.now(),
            };
            if (!shouldSendPing(lastSentRef.current, next)) return;
            lastSentRef.current = next;
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
