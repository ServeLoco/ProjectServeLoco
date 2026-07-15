/**
 * Killed-app / background full-screen alarm path for shop-owner new orders
 * and rider delivery offers. Uses notifee; only invoked from the FCM
 * setBackgroundMessageHandler (never from boot receivers).
 *
 * Foreground alerts remain on useNewOrderAlert / useRiderOfferAlert.
 */
import { Platform } from 'react-native';
import notifee, {
  AndroidCategory,
  AndroidForegroundServiceType,
  AndroidImportance,
  AndroidVisibility,
  EventType,
} from '@notifee/react-native';
import {
  ORDER_ALARM_CHANNEL_ID,
  RIDER_OFFER_ALARM_CHANNEL_ID,
  SHOP_VIBRATION_PATTERN,
  RIDER_VIBRATION_PATTERN,
  createNotifeeAlarmChannels,
} from '../hooks/useLocalNotifications';
import { shopApi } from '../api/shopApi';
import { riderApi } from '../api/riderApi';
import { setCustomerTokenProvider } from '../api/sessionTokens';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '../stores';

// Stable notification ids so cancel-on-open can silence a still-ringing alarm.
export const ORDER_ALARM_NOTIFICATION_ID = 'serveloco-order-alarm';
export const RIDER_OFFER_ALARM_NOTIFICATION_ID = 'serveloco-rider-offer-alarm';

// Shop-owner ring cap (no server-side expiry for new-order alerts).
export const MAX_ORDER_ALARM_RING_MS = 5 * 60 * 1000;

export const ALERT_TYPE_NEW_ORDER = 'new_order_alarm';
export const ALERT_TYPE_RIDER_OFFER = 'rider_offer_alarm';

const ACTION_ACCEPT = 'accept';
const ACTION_REJECT = 'reject';

function isAlarmAlertType(alertType) {
  return alertType === ALERT_TYPE_NEW_ORDER || alertType === ALERT_TYPE_RIDER_OFFER;
}

/**
 * Extract FCM / Expo data payload (string values).
 * @param {object} remoteMessage
 */
export function getRemoteAlarmData(remoteMessage) {
  const data = remoteMessage?.data;
  if (!data || typeof data !== 'object') return null;
  return data;
}

/**
 * Ensure a customer JWT is available for API calls from a background
 * notifee action (app may be killed — token providers not yet wired).
 */
async function ensureBackgroundCustomerToken() {
  let token = useAuthStore.getState()?.token || null;
  if (!token) {
    try {
      const raw = await AsyncStorage.getItem('serveloco-customer-auth');
      if (raw) {
        const parsed = JSON.parse(raw);
        token = parsed?.state?.token || parsed?.token || null;
      }
    } catch {
      token = null;
    }
  }
  if (token) {
    setCustomerTokenProvider(async () => token);
  }
  return token;
}

function resolveRiderTimeoutMs(data) {
  const expiresAt = data?.expiresAt || data?.expires_at;
  if (expiresAt) {
    const end = new Date(expiresAt).getTime();
    if (!Number.isNaN(end)) {
      const remaining = end - Date.now();
      // Clamp: at least 5s so the notification can show; at most 10 min.
      return Math.max(5000, Math.min(remaining, 10 * 60 * 1000));
    }
  }
  // Fallback when expiresAt missing (should not happen for rider offers).
  return MAX_ORDER_ALARM_RING_MS;
}

/**
 * Display a full-screen / ongoing alarm notification for an alarm-type push.
 * Falls back to a heads-up notification when full-screen intent is denied.
 *
 * @param {object} data — remoteMessage.data
 */
export async function displayAlarmNotification(data) {
  if (Platform.OS !== 'android') return;
  if (!data || !isAlarmAlertType(data.alertType)) return;

  await createNotifeeAlarmChannels();

  const isRider = data.alertType === ALERT_TYPE_RIDER_OFFER;
  const orderNumber = data.orderNumber || data.order_number || '';
  const notificationId = isRider
    ? RIDER_OFFER_ALARM_NOTIFICATION_ID
    : ORDER_ALARM_NOTIFICATION_ID;
  const channelId = isRider
    ? RIDER_OFFER_ALARM_CHANNEL_ID
    : ORDER_ALARM_CHANNEL_ID;
  const title = isRider ? 'Delivery offer waiting' : 'New order waiting';
  const body = orderNumber
    ? `Order ${orderNumber} — accept or reject now`
    : (isRider
      ? 'Accept or reject before this offer expires.'
      : 'Accept or reject the order to keep the queue moving.');
  const timeoutAfter = isRider
    ? resolveRiderTimeoutMs(data)
    : MAX_ORDER_ALARM_RING_MS;
  const vibrationPattern = isRider
    ? RIDER_VIBRATION_PATTERN
    : SHOP_VIBRATION_PATTERN;

  let canFullScreen = true;
  try {
    if (typeof notifee.canUseFullScreenIntent === 'function') {
      canFullScreen = await notifee.canUseFullScreenIntent();
    }
  } catch {
    canFullScreen = true;
  }

  const android = {
    channelId,
    category: AndroidCategory.CALL,
    importance: AndroidImportance.HIGH,
    visibility: AndroidVisibility.PUBLIC,
    pressAction: { id: 'default', launchActivity: 'default' },
    actions: [
      {
        title: 'Accept',
        pressAction: { id: ACTION_ACCEPT },
      },
      {
        title: 'Reject',
        pressAction: { id: ACTION_REJECT },
      },
    ],
    // Ongoing alarm-style notification so the sound can loop until action/timeout.
    asForegroundService: true,
    foregroundServiceTypes: [
      AndroidForegroundServiceType.FOREGROUND_SERVICE_TYPE_SPECIAL_USE,
    ],
    ongoing: true,
    autoCancel: false,
    loopSound: true,
    vibrationPattern,
    lightUpScreen: true,
    timeoutAfter,
    // fullScreenAction only when permitted; otherwise heads-up on the channel.
    ...(canFullScreen
      ? {
        fullScreenAction: {
          id: 'default',
          launchActivity: 'default',
        },
      }
      : {}),
  };

  await notifee.displayNotification({
    id: notificationId,
    title,
    body,
    data: {
      alertType: String(data.alertType || ''),
      orderId: String(data.orderId || data.order_id || ''),
      orderNumber: String(orderNumber),
      offerId: String(data.offerId || data.offer_id || ''),
      expiresAt: String(data.expiresAt || data.expires_at || ''),
      type: String(data.type || ''),
    },
    android,
  });
}

/**
 * Cancel the shop and/or rider alarm notification (and stop FGS if any).
 */
export async function cancelOrderAlarm() {
  if (Platform.OS !== 'android') return;
  try {
    await notifee.cancelNotification(ORDER_ALARM_NOTIFICATION_ID);
  } catch { /* ignore */ }
  try {
    await notifee.stopForegroundService();
  } catch { /* ignore */ }
}

export async function cancelRiderOfferAlarm() {
  if (Platform.OS !== 'android') return;
  try {
    await notifee.cancelNotification(RIDER_OFFER_ALARM_NOTIFICATION_ID);
  } catch { /* ignore */ }
  try {
    await notifee.stopForegroundService();
  } catch { /* ignore */ }
}

export async function cancelAllAlarmNotifications() {
  await cancelOrderAlarm();
  await cancelRiderOfferAlarm();
}

/**
 * Handle Accept/Reject from the notifee action buttons.
 * Reuses shopApi / riderApi (same endpoints as dashboard UI).
 */
export async function handleAlarmActionEvent({ type, detail }) {
  if (type !== EventType.ACTION_PRESS && type !== EventType.PRESS) return;

  const pressId = detail?.pressAction?.id;
  const data = detail?.notification?.data || {};
  const alertType = data.alertType;
  const notificationId = detail?.notification?.id;

  // Any press that opens the app should silence the alarm notification.
  if (type === EventType.PRESS || pressId === 'default') {
    if (notificationId) {
      try { await notifee.cancelNotification(notificationId); } catch { /* ignore */ }
    }
    try { await notifee.stopForegroundService(); } catch { /* ignore */ }
    return;
  }

  if (pressId !== ACTION_ACCEPT && pressId !== ACTION_REJECT) return;

  const token = await ensureBackgroundCustomerToken();
  if (!token) {
    // Cannot call API without auth — cancel ring and let user open the app.
    if (notificationId) {
      try { await notifee.cancelNotification(notificationId); } catch { /* ignore */ }
    }
    try { await notifee.stopForegroundService(); } catch { /* ignore */ }
    return;
  }

  try {
    if (alertType === ALERT_TYPE_NEW_ORDER) {
      const orderId = data.orderId || data.order_id;
      if (orderId) {
        if (pressId === ACTION_ACCEPT) {
          await shopApi.confirmOrder(orderId);
        } else {
          await shopApi.rejectOrder(orderId);
        }
      }
      await cancelOrderAlarm();
    } else if (alertType === ALERT_TYPE_RIDER_OFFER) {
      const offerId = data.offerId || data.offer_id;
      if (offerId) {
        if (pressId === ACTION_ACCEPT) {
          await riderApi.acceptOffer(offerId);
        } else {
          await riderApi.rejectOffer(offerId);
        }
      }
      await cancelRiderOfferAlarm();
    }
  } catch (err) {
    console.warn('[orderAlarm] action failed:', err?.message || err);
    // Still stop the ring so the user is not stuck with an endless alarm.
    if (notificationId) {
      try { await notifee.cancelNotification(notificationId); } catch { /* ignore */ }
    }
    try { await notifee.stopForegroundService(); } catch { /* ignore */ }
  }
}

/**
 * Background FCM entry point — only called from setBackgroundMessageHandler.
 */
export async function handleBackgroundAlarmMessage(remoteMessage) {
  const data = getRemoteAlarmData(remoteMessage);
  if (!data || !isAlarmAlertType(data.alertType)) {
    // Non-alarm data messages: no-op (other pushes keep title+body OS path).
    return;
  }
  await displayAlarmNotification(data);
}

export function isAlarmPayload(data) {
  return Boolean(data && isAlarmAlertType(data.alertType));
}
