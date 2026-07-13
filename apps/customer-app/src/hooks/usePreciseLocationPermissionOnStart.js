import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Location from 'expo-location';

/**
 * Prompt for precise (fine) foreground location permission on cold start.
 *
 * Android 12+: system dialog offers Precise vs Approximate when FINE is declared
 * (ACCESS_FINE_LOCATION is in app.json / manifest). We never request background.
 * Never throws; never blocks app boot if the user denies.
 */
export function usePreciseLocationPermissionOnStart() {
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const existing = await Location.getForegroundPermissionsAsync();
        if (cancelled) return;

        // Already granted with fine accuracy — done.
        if (
          existing?.granted &&
          (Platform.OS !== 'android' || existing?.android?.accuracy === 'fine')
        ) {
          return;
        }

        // Not granted, or Android approximate-only: show the system dialog.
        // (If the user previously locked approximate, OS may not re-prompt.)
        if (!existing?.granted || existing?.android?.accuracy === 'coarse') {
          await Location.requestForegroundPermissionsAsync();
        }
      } catch (_) {
        // Permission APIs unavailable / denied — keep app usable.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);
}
