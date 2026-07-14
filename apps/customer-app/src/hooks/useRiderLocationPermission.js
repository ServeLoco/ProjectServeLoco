import { useEffect, useRef, useState } from 'react';
import { Alert, Linking } from 'react-native';
import * as Location from 'expo-location';

/**
 * Request foreground location when rider mode opens (Android/iOS).
 * Riders need GPS for live map tracking and server pings.
 */
export function useRiderLocationPermission() {
  const askedRef = useRef(false);
  const [granted, setGranted] = useState(null);

  useEffect(() => {
    if (askedRef.current) return;
    askedRef.current = true;

    (async () => {
      try {
        const existing = await Location.getForegroundPermissionsAsync();
        if (existing.status === 'granted') {
          setGranted(true);
          return;
        }

        const { status, canAskAgain } = await Location.requestForegroundPermissionsAsync();
        const ok = status === 'granted';
        setGranted(ok);

        if (!ok) {
          Alert.alert(
            'Location needed for deliveries',
            'Rider mode uses your location to show your position on the map and share live tracking with customers. You can enable it in Settings.',
            [
              { text: 'Not now', style: 'cancel' },
              ...(canAskAgain === false
                ? [{ text: 'Open Settings', onPress: () => Linking.openSettings() }]
                : []),
            ],
          );
        }

      } catch (_) {
        setGranted(false);
      }
    })();
  }, []);

  return granted;
}