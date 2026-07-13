import { useEffect } from 'react';
import { Linking, Platform } from 'react-native';
import * as Location from 'expo-location';

/**
 * Request precise (fine) foreground location permission.
 * Safe to call from app start, checkout, or GPS flows.
 * Never throws.
 *
 * @returns {{ granted: boolean, fine: boolean, status?: string, canAskAgain?: boolean, needsSettings?: boolean }}
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
        canAskAgain: existing.canAskAgain !== false,
        needsSettings: false,
      };
    }

    // Permanently denied — OS will not show the dialog again.
    if (!existing?.granted && existing?.canAskAgain === false) {
      return {
        granted: false,
        fine: false,
        status: existing.status,
        canAskAgain: false,
        needsSettings: true,
      };
    }

    // Not granted, or Android approximate-only: show the system dialog.
    const result = await Location.requestForegroundPermissionsAsync();
    const fine =
      Boolean(result?.granted) &&
      (Platform.OS !== 'android' ||
        result?.android?.accuracy === 'fine' ||
        result?.android?.accuracy == null);
    const canAskAgain = result?.canAskAgain !== false;

    return {
      granted: Boolean(result?.granted),
      fine,
      status: result?.status,
      canAskAgain,
      needsSettings: !result?.granted && !canAskAgain,
    };
  } catch (_) {
    return {
      granted: false,
      fine: false,
      status: 'undetermined',
      canAskAgain: true,
      needsSettings: false,
    };
  }
}

/** Open the OS app settings page so the user can enable Location. */
export function openAppLocationSettings() {
  return Linking.openSettings().catch(() => {});
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
