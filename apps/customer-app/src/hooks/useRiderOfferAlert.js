import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { Platform, Vibration } from 'react-native';
import { playNotificationChime } from '../utils/notificationChime';
import {
  RIDER_OFFER_CHANNEL_ID,
  RIDER_VIBRATION_PATTERN,
} from './useLocalNotifications';
import { cancelRiderOfferAlarm } from '../utils/orderAlarmNotifications';

// Local chime + vibration while the Accept popup is open (app in foreground).
// Server also re-sends Expo push every ~15s until accept/reject/expire so
// the rider still gets alerts when the app is backgrounded or closed.
const REPEAT_MS = 8000;
const NOTIFICATION_ID = 'serveloco-rider-offer-alert';

/**
 * Repeating in-app alert while a rider offer popup is open.
 * Opening the rider dashboard (this hook mounts) silences any killed-app
 * notifee alarm that may still be ringing.
 * @param {object|null|boolean} activeOffer — truthy while offer is waiting
 */
export function useRiderOfferAlert(activeOffer) {
  const intervalRef = useRef(null);
  const active = Boolean(activeOffer);

  // Silences a still-ringing killed-app notifee alarm when the rider dashboard opens.
  useEffect(() => {
    cancelRiderOfferAlarm().catch(() => {});
  }, []);
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
    const fire = () => {
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
  }, [active, offerId, orderId, orderNumber]);
}
