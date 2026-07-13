import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Location from 'expo-location';

/**
 * Request precise (fine) foreground location permission.
 * Safe to call from app start, checkout, or GPS flows.
 * Never throws.
 *
 * @returns {{ granted: boolean, fine: boolean, status?: string, canAskAgain?: boolean }}
 */
export async function requestPreciseLocationPermission() {
  try {
    const existing = await Location.getForegroundPermissionsAsync();

    // Already granted with fine accuracy — nothing to do.
    if (
      existing?.granted &&
      (Platform.OS !== 'android' || existing?.android?.accuracy === 'fine')
    ) {
      return {
        granted: true,
        fine: true,
        status: existing.status,
        canAskAgain: existing.canAskAgain,
      };
    }

    // Not granted, or Android approximate-only: show the system dialog.
    // (If the user permanently denied, OS may not re-prompt; canAskAgain=false.)
    const result = await Location.requestForegroundPermissionsAsync();
    const fine =
      Boolean(result?.granted) &&
      (Platform.OS !== 'android' ||
        result?.android?.accuracy === 'fine' ||
        result?.android?.accuracy == null);

    return {
      granted: Boolean(result?.granted),
      fine,
      status: result?.status,
      canAskAgain: result?.canAskAgain,
    };
  } catch (_) {
    return { granted: false, fine: false, status: 'undetermined' };
  }
}

/**
 * Prompt for precise (fine) foreground location permission on cold start.
 * Never request background. Never block app boot if the user denies.
 */
export function usePreciseLocationPermissionOnStart() {
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (cancelled) return;
      await requestPreciseLocationPermission();
    })();

    return () => {
      cancelled = true;
    };
  }, []);
}
