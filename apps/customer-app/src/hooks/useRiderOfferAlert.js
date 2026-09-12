import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { AppState, Vibration } from 'react-native';
import { RIDER_VIBRATION_PATTERN } from './useLocalNotifications';
import {
  cancelRiderOfferAlarm,
  clearOfferForegroundMarker,
  displayAlarmNotification,
  markAppBackground,
  markOfferHandledForeground,
  ALERT_TYPE_RIDER_OFFER,
} from '../utils/orderAlarmNotifications';
import { playAlarmSound, stopAlarmSound } from '../utils/alarmSound';

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

  // Do NOT cancel the loud alarm when the dashboard opens after a notification
  // tap — ring continues until Accept/Reject. Only clear when the offer is gone.
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
      // Only silence the media alarm when the app is actually on screen. This
      // runs on every effect cleanup — including the re-runs caused by a socket
      // reminder rebuilding the offer object — and while backgrounded that
      // alarm is the rider's only alert, meant to ring until accept/reject.
      if (AppState.currentState === 'active') {
        stopAlarmSound();
      }
    };

    const fire = () => {
      if (AppState.currentState !== 'active') return;

      // The Accept/Reject popup is already on screen — no need for an OS
      // notification banner too, so nothing else would make a sound here:
      // this loop is the rider's only audible cue while the app is open.
      try {
        Vibration.vibrate(RIDER_VIBRATION_PATTERN);
      } catch { /* ignore */ }

      // Same alarm tone the background surfaces use, ringing until the rider
      // accepts or rejects. It goes out on the ALARM stream, so a rider with
      // media muted still hears it. Re-calling this is a no-op while the tone
      // is already playing — vibration stays on this loop's own cadence.
      playAlarmSound('rider', { untilStopped: true, vibrate: false, alarmStream: true });
    };

    // Tear down any leftover background alarm (loud notifee banner +
    // draw-over-other-apps card) the instant the in-app popup is on screen.
    // Those surfaces exist only for "app closed / screen off" — if the offer
    // was created while backgrounded they're already ringing, and nothing
    // else cancels them when the rider opens the app back up (only the
    // "offer gone" branch above does). Without this, foreground shows the
    // popup AND the still-live alarm notification + overlay on top of it.
    const clearBackgroundSurfacesIfForeground = () => {
      if (AppState.currentState !== 'active') return;
      cancelRiderOfferAlarm().catch(() => {});
      markOfferHandledForeground(offerId).catch(() => {});
    };

    if (!active) {
      stop();
      return undefined;
    }

    clearBackgroundSurfacesIfForeground();
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
        // Hand the ring over to the notification channel: the alarm posted
        // below plays its own sound, and leaving the in-app tone running
        // would stack two copies of it.
        stopAlarmSound();
        if (active) {
          const offer = offerRef.current;
          // Both foreground markers must be dropped BEFORE displaying, or
          // displayAlarmNotification skips this alarm as "already handled in
          // the foreground" — they were written while the popup was on screen
          // and outlive the switch to background by 8s / 20s otherwise.
          (async () => {
            await markAppBackground();
            await clearOfferForegroundMarker(offerId);
            await displayAlarmNotification({
              alertType: ALERT_TYPE_RIDER_OFFER,
              type: 'rider_offer',
              offerId: String(offer?.id || offer?.offerId || ''),
              orderId: String(offer?.orderId || offer?.order_id || ''),
              orderNumber: String(
                offer?.orderNumber || offer?.order_number || orderNumber || '',
              ),
              expiresAt: String(offer?.expiresAt || offer?.expires_at || ''),
              // Without this the floating card draws with a blank price and
              // only fills in when the next push (socket or FCM) re-draws it
              // seconds later — the offer object on screen already has it.
              total: String(offer?.total ?? ''),
            });
          })().catch(() => {});
        }
      } else if (active && !intervalRef.current) {
        clearBackgroundSurfacesIfForeground();
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
