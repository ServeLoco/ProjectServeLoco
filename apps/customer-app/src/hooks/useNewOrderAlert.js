import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { playNotificationChime } from '../utils/notificationChime';

const REPEAT_MS = 8000;
const NOTIFICATION_ID = 'serveloco-new-order-alert';

/**
 * Repeating in-app alert for the shop-owner new-order popup. No new native
 * dependency — reuses expo-notifications (already compiled into the build)
 * to fire a local notification with sound every REPEAT_MS while `active` is
 * true. The app's global notification handler (useLocalNotifications.js)
 * already plays sound + shows the banner for local (non-push) notifications
 * in the foreground, so this "just works" without any extra wiring.
 *
 * Fires once immediately when `active` flips true (mirrors the admin web
 * app's GlobalOrderAlert "grew" detection), then loops every REPEAT_MS.
 * Stops instantly when `active` flips false.
 */
export function useNewOrderAlert(active) {
  const intervalRef = useRef(null);

  useEffect(() => {
    const fire = () => {
      Notifications.scheduleNotificationAsync({
        identifier: NOTIFICATION_ID,
        content: {
          title: 'New order waiting',
          body: 'Accept or reject the order to keep the queue moving.',
          sound: 'default',
        },
        // Android: channelId must be on the trigger, not in content — in
        // content it's silently ignored and the notification lands on the
        // OS fallback channel, which has no sound/heads-up. A bare
        // { channelId } trigger still fires immediately.
        trigger: Platform.OS === 'android'
          ? { channelId: 'serveloco-orders' }
          : null,
      }).catch(() => {});
      // The repeating alert only runs while the shop-owner dashboard is
      // foregrounded — OEM skins that mute foreground notification sounds
      // would make it silent, so play the chime through the audio stack.
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
