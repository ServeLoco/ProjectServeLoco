import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { AppState, Platform, Vibration } from 'react-native';
import { playNotificationChime } from '../utils/notificationChime';
import {
  RIDER_OFFER_CHANNEL_ID,
  RIDER_VIBRATION_PATTERN,
} from './useLocalNotifications';
import {
  cancelRiderOfferAlarm,
  displayAlarmNotification,
  ALERT_TYPE_RIDER_OFFER,
} from '../utils/orderAlarmNotifications';
import { stopAlarmSound } from '../utils/alarmSound';

// Local chime + vibration while the Accept popup is open (app in foreground).
// Server also re-sends Expo push every ~15s until accept/reject/expire so
// the rider still gets alerts when the app is backgrounded or closed.
const REPEAT_MS = 8000;
const NOTIFICATION_ID = 'serveloco-rider-offer-alert';

/**
 * Repeating in-app alert while a rider offer popup is open (foreground only).
 * Background uses the single remote alarm push with tag replace — not a local
 * 8s banner stack.
 * @param {object|null|boolean} activeOffer — truthy while offer is waiting
 */
export function useRiderOfferAlert(activeOffer) {
  const intervalRef = useRef(null);
  const active = Boolean(activeOffer);

  // Silences a still-ringing killed-app notifee alarm when the rider dashboard opens.
  useEffect(() => {
    cancelRiderOfferAlarm().catch(() => {});
    Notifications.dismissAllNotificationsAsync().catch(() => {});
  }, []);

  // Stop media loop when offer queue clears (accept/reject last offer).
  useEffect(() => {
    if (!active) {
      stopAlarmSound();
      cancelRiderOfferAlarm().catch(() => {});
    }
  }, [active]);

  const orderNumber =
    (activeOffer && (activeOffer.orderNumber || activeOffer.order_number)) || null;
  // Identity for the effect: which offer is at the head of the queue, not the
  // object reference. offerQueue is rebuilt (new array + spread objects) on
  // every fetchAll()/reminder/socket event even when the same offer is still
  // front — keying on activeOffer itself would restart this effect (and
  // re-fire chime + vibrate) far more often than the intended REPEAT_MS loop.
  const offerId = (activeOffer && (activeOffer.id ?? activeOffer.offerId)) ?? null;
  const orderId = (activeOffer && (activeOffer.orderId ?? activeOffer.order_id)) ?? null;
  // fire() still needs the full latest offer (for data.offerId/orderId) —
  // read it from a ref so it isn't a dep that would defeat the point above.
  const offerRef = useRef(activeOffer);
  offerRef.current = activeOffer;

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
      stopAlarmSound();
    };

    const fire = () => {
      if (AppState.currentState !== 'active') return;

      const offer = offerRef.current;
      const body = orderNumber
        ? `Order ${orderNumber} — accept now before it expires`
        : 'Accept or reject before this offer expires.';

      Notifications.scheduleNotificationAsync({
        identifier: NOTIFICATION_ID,
        content: {
          title: 'Delivery offer waiting',
          body,
          sound: 'default',
          // Android: per-notification vibrate (channel also vibrates on remote push).
          vibrate: RIDER_VIBRATION_PATTERN,
          data: {
            type: 'rider_offer',
            offerId: offer?.id || offer?.offerId || '',
            orderId: offer?.orderId || offer?.order_id || '',
          },
        },
        trigger: Platform.OS === 'android'
          ? { channelId: RIDER_OFFER_CHANNEL_ID }
          : null,
      }).catch(() => {});

      // Foreground: OEMs often mute notification vibration for the active app —
      // drive the vibrator directly so the rider always feels the alert.
      try {
        Vibration.vibrate(RIDER_VIBRATION_PATTERN);
      } catch { /* ignore */ }

      playNotificationChime();
    };

    if (!active) {
      stop();
      return undefined;
    }

    fire();
    intervalRef.current = setInterval(fire, REPEAT_MS);

    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        try { Vibration.cancel(); } catch { /* ignore */ }
        Notifications.dismissNotificationAsync(NOTIFICATION_ID).catch(() => {});
        // Background: keep full-screen media alarm until accept/reject.
        if (active) {
          const offer = offerRef.current;
          displayAlarmNotification({
            alertType: ALERT_TYPE_RIDER_OFFER,
            type: 'rider_offer',
            offerId: String(offer?.id || offer?.offerId || ''),
            orderId: String(offer?.orderId || offer?.order_id || ''),
            orderNumber: String(
              offer?.orderNumber || offer?.order_number || orderNumber || '',
            ),
            expiresAt: String(offer?.expiresAt || offer?.expires_at || ''),
          }).catch(() => {});
        }
      } else if (active && !intervalRef.current) {
        fire();
        intervalRef.current = setInterval(fire, REPEAT_MS);
      }
    });

    return () => {
      sub.remove();
      stop();
    };
  }, [active, offerId, orderId, orderNumber]);
}
