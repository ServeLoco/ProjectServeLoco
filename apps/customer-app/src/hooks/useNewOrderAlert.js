import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { Platform, Vibration } from 'react-native';
import { playNotificationChime } from '../utils/notificationChime';
import {
  ORDER_NOTIFICATION_CHANNEL_ID,
  SHOP_VIBRATION_PATTERN,
} from './useLocalNotifications';
import { cancelOrderAlarm } from '../utils/orderAlarmNotifications';

const REPEAT_MS = 8000;
const NOTIFICATION_ID = 'serveloco-new-order-alert';
// Re-export ring cap for callers that need it (also defined in orderAlarmNotifications).
export { MAX_ORDER_ALARM_RING_MS } from '../utils/orderAlarmNotifications';

/**
 * Repeating in-app alert for the shop-owner (and admin) new-order popup.
 * Local notification + chime + vibration every REPEAT_MS while `active` is
 * true. Fires once immediately when active flips true, then loops.
 * Stops (and cancels vibration) when active flips false.
 *
 * Opening the dashboard (this hook mounts) also silences any killed-app
 * notifee alarm that may still be ringing.
 */
export function useNewOrderAlert(active) {
  const intervalRef = useRef(null);

  // Silences killed-app alarm + clears stacked OS trays when dashboard opens
  // (proper flow: one popup in-app, not a pile of banners).
  useEffect(() => {
    cancelOrderAlarm().catch(() => {});
    Notifications.dismissAllNotificationsAsync().catch(() => {});
  }, []);

  useEffect(() => {
    const fire = () => {
      Notifications.scheduleNotificationAsync({
        identifier: NOTIFICATION_ID,
        content: {
          title: 'New order waiting',
          body: 'Accept or reject the order to keep the queue moving.',
          sound: 'default',
          // Android: per-notification vibrate (channel also vibrates on remote push).
          vibrate: SHOP_VIBRATION_PATTERN,
        },
        // Android: channelId must be on the trigger, not in content — in
        // content it's silently ignored and the notification lands on the
        // OS fallback channel, which has no sound/heads-up. A bare
        // { channelId } trigger still fires immediately.
        trigger: Platform.OS === 'android'
          ? { channelId: ORDER_NOTIFICATION_CHANNEL_ID }
          : null,
      }).catch(() => {});
      // Foreground: OEM skins often mute notification vibration for the
      // active app — drive the vibrator directly so the owner always feels it.
      try {
        Vibration.vibrate(SHOP_VIBRATION_PATTERN);
      } catch { /* ignore */ }
      // Chime through the audio stack (notification sound alone is unreliable
      // while the dashboard is foregrounded).
      playNotificationChime();
    };

    if (!active) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      try {
        Vibration.cancel();
      } catch { /* ignore */ }
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
      try {
        Vibration.cancel();
      } catch { /* ignore */ }
    };
  }, [active]);
}
