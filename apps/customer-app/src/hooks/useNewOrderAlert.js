import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { AppState, Platform, Vibration } from 'react-native';
import { playNotificationChime } from '../utils/notificationChime';
import {
  ORDER_NOTIFICATION_CHANNEL_ID,
  SHOP_VIBRATION_PATTERN,
} from './useLocalNotifications';
import {
  ALERT_TYPE_NEW_ORDER,
  cancelOrderAlarm,
  clearOfferForegroundMarker,
  displayAlarmNotification,
  markAppBackground,
  markOfferHandledForeground,
} from '../utils/orderAlarmNotifications';
import { playAlarmSound, stopAlarmSound } from '../utils/alarmSound';

const REPEAT_MS = 8000;
const NOTIFICATION_ID = 'serveloco-new-order-alert';
// Re-export ring cap for callers that need it (also defined in orderAlarmNotifications).
export { MAX_ORDER_ALARM_RING_MS } from '../utils/orderAlarmNotifications';

/**
 * Repeating in-app alert for the new-order popup.
 *
 * Used by:
 * - Shop dashboard (`options.role === 'shop'`) — mirrors the rider offer flow:
 *   while the app is open the Accept/Reject popup is on screen, so the alert is
 *   alarm tone + vibration only and NO OS notification is posted; on the way to
 *   the background the ring is handed over to the notifee alarm + floating
 *   overlay card (see displayAlarmNotification). Pass the head order object (not
 *   just a boolean) so the per-order foreground markers can be written.
 * - Admin popups (default) — original quiet loop with its notification banner,
 *   unchanged for admin UX.
 *
 * @param {object|boolean|null} active — head order (shop) or boolean (admin)
 * @param {{ role?: 'shop' | 'admin' }} [options]
 */
export function useNewOrderAlert(activeOrder, options = {}) {
  const isShop = options.role === 'shop';
  const intervalRef = useRef(null);
  const active = Boolean(activeOrder);

  // Shop only: keep loud alarm after opening the app (notification tap).
  // Stop only when the pending queue is empty (accept/reject done).
  useEffect(() => {
    if (!isShop) return undefined;
    if (!active) {
      stopAlarmSound();
      cancelOrderAlarm().catch(() => {});
    }
    return undefined;
  }, [active, isShop]);

  // Identity for the effect: which order is at the head of the queue, not the
  // object reference — the queue is rebuilt on every fetchAll()/socket event
  // even when the same order is still front, and keying on the object would
  // restart the loop (re-firing the tone + vibration) far more often than
  // REPEAT_MS intends.
  const orderId = (activeOrder && typeof activeOrder === 'object' && activeOrder.id) || null;
  const orderRef = useRef(activeOrder);
  orderRef.current = activeOrder;

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
      // Only silence the media alarm when the app is actually on screen. This
      // runs on every effect cleanup — including re-runs caused by a socket
      // event rebuilding the order object — and while backgrounded that alarm
      // is the owner's only alert, meant to ring until accept/reject.
      if (isShop && AppState.currentState === 'active') {
        stopAlarmSound();
      }
    };

    const fire = () => {
      // Shop: only while foreground (background uses the notifee alarm + card).
      // Admin: original behavior — fire whenever active (no AppState gate).
      if (isShop && AppState.currentState !== 'active') return;

      if (isShop) {
        // The Accept/Reject popup is already on screen — no OS notification
        // banner too. This loop is the owner's only cue while the app is open.
        try {
          Vibration.vibrate(SHOP_VIBRATION_PATTERN);
        } catch { /* ignore */ }
        // Same alarm tone the background surfaces use, ringing until the owner
        // accepts or rejects. It goes out on the ALARM stream, so an owner with
        // media muted still hears it. Re-calling this is a no-op while the tone
        // is already playing — vibration stays on this loop's own cadence.
        playAlarmSound('order', { untilStopped: true, vibrate: false, alarmStream: true });
        return;
      }

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

    // Tear down any leftover background alarm (ringing notifee notification +
    // draw-over-other-apps card) the instant the in-app popup is on screen.
    // Those surfaces exist only for "app closed / screen off" — if the order
    // arrived while backgrounded they're already ringing, and nothing else
    // cancels them when the owner opens the app back up (only the "queue
    // empty" branch above does). Without this, foreground shows the popup AND
    // the still-live alarm + overlay card on top of it.
    const clearBackgroundSurfacesIfForeground = () => {
      if (!isShop) return;
      if (AppState.currentState !== 'active') return;
      cancelOrderAlarm().catch(() => {});
      markOfferHandledForeground(orderId).catch(() => {});
    };

    if (!active) {
      stop();
      return undefined;
    }

    clearBackgroundSurfacesIfForeground();
    fire();
    intervalRef.current = setInterval(fire, REPEAT_MS);

    // Shop only: pause local loop while backgrounded and hand the ring over to
    // the notifee alarm + floating card.
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
          // Hand the ring over to the notification channel: the alarm posted
          // below plays its own sound, and leaving the in-app tone running
          // would stack two copies of it.
          stopAlarmSound();
          const order = orderRef.current;
          // Both foreground markers must be dropped BEFORE displaying, or
          // displayAlarmNotification skips this alarm as "already handled in
          // the foreground" — they were written while the popup was on screen
          // and outlive the switch to background by 8s / 20s otherwise.
          (async () => {
            await markAppBackground();
            await clearOfferForegroundMarker(orderId);
            await displayAlarmNotification({
              alertType: ALERT_TYPE_NEW_ORDER,
              type: 'shop_order',
              orderId: String(order?.id ?? orderId ?? ''),
              orderNumber: String(order?.orderNumber || order?.order_number || ''),
              // Without this the floating card draws with a blank amount and
              // only fills in when the next push re-draws it seconds later —
              // the order object on screen already has it.
              total: String(order?.shopTotal ?? order?.shop_total ?? ''),
            });
          })().catch(() => {});
        } else if (active && !intervalRef.current) {
          clearBackgroundSurfacesIfForeground();
          fire();
          intervalRef.current = setInterval(fire, REPEAT_MS);
        }
      });
    }

    return () => {
      if (sub) sub.remove();
      stop();
    };
  }, [active, isShop, orderId]);
}
