import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { playNotificationChime } from '../utils/notificationChime';

const REPEAT_MS = 8000;
const NOTIFICATION_ID = 'serveloco-rider-offer-alert';

/**
 * Repeating in-app alert while a rider offer popup is open.
 * Mirrors useNewOrderAlert (shop owner) with rider-specific copy.
 */
export function useRiderOfferAlert(active) {
  const intervalRef = useRef(null);

  useEffect(() => {
    const fire = () => {
      Notifications.scheduleNotificationAsync({
        identifier: NOTIFICATION_ID,
        content: {
          title: 'Delivery offer waiting',
          body: 'Accept or reject within 2 minutes.',
          sound: 'default',
        },
        trigger: Platform.OS === 'android'
          ? { channelId: 'serveloco-orders' }
          : null,
      }).catch(() => {});
      playNotificationChime();
    };

    if (!active) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      Notifications.dismissNotificationAsync(NOTIFICATION_ID).catch(() => {});
      return undefined;
    }

    fire();
    intervalRef.current = setInterval(fire, REPEAT_MS);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [active]);
}
