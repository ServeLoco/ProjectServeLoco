import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { AppState, Platform, Vibration } from 'react-native';
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
 * Repeating in-app alert for the new-order popup.
 *
 * Used by:
 * - Shop dashboard (`options.role === 'shop'`) — alarm tray clear + background
 *   pause so remote shop-alarm push owns background delivery.
 * - Admin popups (default) — original quiet loop, unchanged for admin UX.
 *
 * @param {boolean} active
 * @param {{ role?: 'shop' | 'admin' }} [options]
 */
export function useNewOrderAlert(active, options = {}) {
  const isShop = options.role === 'shop';
  const intervalRef = useRef(null);

  // Shop only: silence killed-app alarm + clear trays when dashboard opens.
  // Admin must not dismissAll (would wipe unrelated admin notifications).
  useEffect(() => {
    if (!isShop) return undefined;
    cancelOrderAlarm().catch(() => {});
    Notifications.dismissAllNotificationsAsync().catch(() => {});
    return undefined;
  }, [isShop]);

  useEffect(() => {
    const stop = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      try {
        Vibration.cancel();
      } catch { /* ignore */ }
      Notifications.dismissNotificationAsync(NOTIFICATION_ID).catch(() => {});
    };

    const fire = () => {
      // Shop: only while foreground (background uses remote alarm push).
      // Admin: original behavior — fire whenever active (no AppState gate).
      if (isShop && AppState.currentState !== 'active') return;

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
      stop();
      return undefined;
    }

    fire();
    intervalRef.current = setInterval(fire, REPEAT_MS);

    // Shop only: pause local loop while backgrounded.
    let sub = null;
    if (isShop) {
      sub = AppState.addEventListener('change', (next) => {
        if (next !== 'active') {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          try { Vibration.cancel(); } catch { /* ignore */ }
          Notifications.dismissNotificationAsync(NOTIFICATION_ID).catch(() => {});
        } else if (active && !intervalRef.current) {
          fire();
          intervalRef.current = setInterval(fire, REPEAT_MS);
        }
      });
    }

    return () => {
      if (sub) sub.remove();
      stop();
    };
  }, [active, isShop]);
}
