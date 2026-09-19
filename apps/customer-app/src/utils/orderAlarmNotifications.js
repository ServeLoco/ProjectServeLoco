/**
 * Killed-app / background full-screen alarm path for shop-owner new orders
 * and rider delivery offers. Uses notifee; only invoked from the FCM
 * setBackgroundMessageHandler (never from boot receivers).
 *
 * Foreground alerts remain on useNewOrderAlert / useRiderOfferAlert.
 */
import { AppState, Platform } from 'react-native';
import notifee, {
  AndroidCategory,
  AndroidForegroundServiceType,
  AndroidImportance,
  AndroidVisibility,
  EventType,
} from '@notifee/react-native';
import {
  ORDER_ALARM_CHANNEL_ID,
  ORDER_ALARM_QUIET_CHANNEL_ID,
  RIDER_OFFER_ALARM_CHANNEL_ID,
  RIDER_OFFER_QUIET_CHANNEL_ID,
  createNotifeeAlarmChannels,
} from '../hooks/useLocalNotifications';
import { shopApi } from '../api/shopApi';
import { riderApi } from '../api/riderApi';
import { setCustomerTokenProvider } from '../api/sessionTokens';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '../stores';
import { playAlarmSound, stopAlarmSound } from './alarmSound';
import {
  canShowOverlay,
  showOverlayOfferCard,
  hideOverlayOfferCard,
  isScreenLockedOrOff,
  isAlarmScreenVisible,
  closeAlarmScreen,
  isAppOnScreen,
} from './overlayOfferCard';

// Rider offers only — launched from the alarm notification's press/full-screen
// action instead of MainActivity so a cold, locked device boots straight into
// the minimal Accept/Reject+total card (no nav stack, no Mapbox) instead of
// the full app. See index.js's AppRegistry.registerComponent('alarm', ...).
const ALARM_ACTIVITY = 'com.yashsiwach.villkro.AlarmActivity';

// Stable notification ids so cancel-on-open can silence a still-ringing alarm.
export const ORDER_ALARM_NOTIFICATION_ID = 'serveloco-order-alarm';
export const RIDER_OFFER_ALARM_NOTIFICATION_ID = 'serveloco-rider-offer-alarm';

// Shop-owner ring cap (no server-side expiry for new-order alerts).
export const MAX_ORDER_ALARM_RING_MS = 5 * 60 * 1000;

export const ALERT_TYPE_NEW_ORDER = 'new_order_alarm';
export const ALERT_TYPE_RIDER_OFFER = 'rider_offer_alarm';

const ACTION_ACCEPT = 'accept';
const ACTION_REJECT = 'reject';

// Dedupe window: server re-pushes the same offer ~every 15s. Re-displaying
// the full-screen alarm + restarting media sound on every FCM message feels
// like spam. Same offer/order within this window is a no-op (already ringing).
const ALARM_DEDUPE_MS = 45_000;
let activeAlarmKey = null;

// Android routes a background FCM data message to a separate HEADLESS JS
// instance for setBackgroundMessageHandler — that instance's own
// AppState.currentState does not reliably reflect whether the real (main)
// app instance is actually foregrounded, so a plain in-process check can
// let the full-screen alarm slip through while the rider is already looking
// at the in-app Accept/Reject popup. AsyncStorage is one disk-backed store
// shared by every JS instance on the device, so a heartbeat the main
// instance writes while active is a reliable cross-instance signal here.
const APP_FOREGROUND_KEY = 'serveloco:appForegroundAt';
const FOREGROUND_FRESH_MS = 8_000;

/** Call from the main app instance while it's genuinely foregrounded. */
export async function markAppForeground() {
  try {
    await AsyncStorage.setItem(APP_FOREGROUND_KEY, String(Date.now()));
  } catch { /* ignore */ }
}

/**
 * Call the moment the app leaves the foreground. Without this the last
 * heartbeat keeps reading "fresh" for up to FOREGROUND_FRESH_MS after the
 * rider locks the screen, and every alarm arriving in that window is skipped
 * as "already covered by the in-app popup" — i.e. no ring at all.
 */
export async function markAppBackground() {
  try {
    await AsyncStorage.removeItem(APP_FOREGROUND_KEY);
  } catch { /* ignore */ }
}

async function isAppForegroundRecent() {
  try {
    const raw = await AsyncStorage.getItem(APP_FOREGROUND_KEY);
    const ts = raw ? Number(raw) : 0;
    return Number.isFinite(ts) && Date.now() - ts < FOREGROUND_FRESH_MS;
  } catch {
    return false;
  }
}

// Per-offer suppression: the socket path (main JS, fast) and the FCM path
// (may land in a headless instance, slower) can both react to the same
// offer. The heartbeat above only proves "the app was foregrounded recently"
// — it can't stop a slow-arriving FCM alarm for an offer that was ALREADY
// shown as the in-app popup moments earlier by the fast socket path. Marking
// the specific offer id closes that race regardless of which path is slow.
const OFFER_FOREGROUND_KEY_PREFIX = 'serveloco:offerFg:';
const OFFER_FOREGROUND_FRESH_MS = 20_000;

/** Call from the main app instance when an offer is shown as the in-app popup. */
export async function markOfferHandledForeground(id) {
  if (!id) return;
  try {
    await AsyncStorage.setItem(OFFER_FOREGROUND_KEY_PREFIX + id, String(Date.now()));
  } catch { /* ignore */ }
}

/**
 * Drop the per-offer suppression as soon as the app backgrounds — the flag
 * only means "the in-app popup is covering this offer right now", which stops
 * being true the instant the rider locks the screen. Leaving it to expire on
 * its own silences the lock-screen alarm for the rest of the window.
 */
export async function clearOfferForegroundMarker(id) {
  if (!id) return;
  try {
    await AsyncStorage.removeItem(OFFER_FOREGROUND_KEY_PREFIX + id);
  } catch { /* ignore */ }
}

async function wasOfferHandledForeground(id) {
  if (!id) return false;
  try {
    const raw = await AsyncStorage.getItem(OFFER_FOREGROUND_KEY_PREFIX + id);
    const ts = raw ? Number(raw) : 0;
    return Number.isFinite(ts) && Date.now() - ts < OFFER_FOREGROUND_FRESH_MS;
  } catch {
    return false;
  }
}

let activeAlarmAt = 0;

function isAlarmAlertType(alertType) {
  return alertType === ALERT_TYPE_NEW_ORDER || alertType === ALERT_TYPE_RIDER_OFFER;
}

/** Stable key for one logical alarm (one offer / one new-order). */
function alarmDedupeKey(data) {
  if (!data) return null;
  if (data.alertType === ALERT_TYPE_RIDER_OFFER) {
    const offerId = data.offerId || data.offer_id;
    return offerId ? `rider:${offerId}` : null;
  }
  if (data.alertType === ALERT_TYPE_NEW_ORDER) {
    const orderId = data.orderId || data.order_id;
    return orderId ? `order:${orderId}` : null;
  }
  return null;
}

function markAlarmActive(data) {
  const key = alarmDedupeKey(data);
  if (!key) return;
  activeAlarmKey = key;
  activeAlarmAt = Date.now();
}

function clearAlarmActive(kind) {
  if (kind === 'rider' && activeAlarmKey?.startsWith('rider:')) {
    activeAlarmKey = null;
    activeAlarmAt = 0;
  } else if (kind === 'order' && activeAlarmKey?.startsWith('order:')) {
    activeAlarmKey = null;
    activeAlarmAt = 0;
  } else if (kind === 'all') {
    activeAlarmKey = null;
    activeAlarmAt = 0;
  }
}

/**
 * True if we already displayed this offer/order alarm recently (still ringing).
 * Server reminders should not re-fire full-screen + sound every 15s.
 */
function isDuplicateActiveAlarm(data) {
  const key = alarmDedupeKey(data);
  if (!key || !activeAlarmKey) return false;
  if (key !== activeAlarmKey) return false;
  return Date.now() - activeAlarmAt < ALARM_DEDUPE_MS;
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
 * Read persisted auth from AsyncStorage (Zustand persist shape).
 * Headless FCM JS often starts before rehydrate — memory store is empty.
 */
async function readPersistedAuthState() {
  try {
    const raw = await AsyncStorage.getItem('serveloco-customer-auth');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.state || parsed || null;
  } catch {
    return null;
  }
}

/**
 * Ensure a customer JWT is available for API calls from a background
 * notifee action (app may be killed — token providers not yet wired).
 * Exported for reuse by other background-only entry points (e.g.
 * riderBackgroundLocationTask.js's TaskManager callback) that hit the same
 * "JS relaunched headless, App.js's setCustomerTokenProvider(() =>
 * useAuthStore.getState().token) never ran, zustand-persist hasn't
 * rehydrated yet" gap.
 */
export async function ensureBackgroundCustomerToken() {
  let token = useAuthStore.getState()?.token || null;
  if (!token) {
    const persisted = await readPersistedAuthState();
    token = persisted?.token || null;
  }
  if (token) {
    setCustomerTokenProvider(async () => token);
  }
  return token;
}

/**
 * Shop/rider gate for alarms: seed Zustand from disk when headless cold-start
 * has not rehydrated yet (otherwise displayAlarmNotification no-ops).
 * @returns {Promise<{ shop: object|null, rider: object|null }>}
 */
async function ensureShopOrRiderSession() {
  let { shop, rider, token, user, profile, isAuthenticated } = useAuthStore.getState();
  if (shop || rider) {
    return { shop, rider };
  }
  const persisted = await readPersistedAuthState();
  if (!persisted) return { shop: null, rider: null };

  const pShop = persisted.shop ?? null;
  const pRider = persisted.rider ?? null;
  if (!pShop && !pRider) {
    return { shop: null, rider: null };
  }

  // Seed enough session for alarm display + Accept/Reject API.
  useAuthStore.setState({
    token: persisted.token ?? token ?? null,
    user: persisted.user ?? user ?? null,
    profile: persisted.profile ?? profile ?? null,
    shop: pShop,
    rider: pRider,
    isAuthenticated: Boolean(persisted.token || isAuthenticated),
  });
  if (persisted.token) {
    setCustomerTokenProvider(async () => persisted.token);
  }
  return { shop: pShop, rider: pRider };
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
  // The dashboard's own Accept/Reject popup + vibrate/chime (useRiderOfferAlert)
  // already cover this while the app is foregrounded — a full-screen alarm
  // notification on top of it is redundant. RNFB's setBackgroundMessageHandler
  // can fire even while active (the reason this guard lives here rather than
  // only at each call site), so this is the one place that reliably blocks it.
  if (AppState.currentState === 'active') return;
  // AppState reads 'background' inside Android's headless background-message
  // JS instance even while the rider is staring at the app, and the heartbeat
  // below can lose a race with the socket path that opens the in-app popup.
  // The activity lifecycle is the one source that is right in both cases.
  if (await isAppOnScreen()) {
    console.warn('[orderAlarm] skip: app is on screen');
    return;
  }
  if (await isAppForegroundRecent()) return;
  // Closes the race where the fast socket path already showed this exact
  // offer/order as the in-app popup, but a slower-arriving FCM data message
  // for the SAME offer reaches this function moments later (e.g. via a
  // headless instance) after the heartbeat above has gone stale-looking.
  const dedupeId = data.offerId || data.offer_id || data.orderId || data.order_id;
  if (await wasOfferHandledForeground(dedupeId)) return;
  // The full-screen card is already up for this offer. The server re-pushes
  // every ~15s, and re-running this would cancel and re-post the ringing
  // notification underneath the card the rider is looking at.
  if (await isAlarmScreenVisible()) {
    console.warn('[orderAlarm] skip: alarm screen already showing');
    return;
  }

  // Shop-owner + rider sessions only (rehydrate from disk if headless).
  const { shop, rider } = await ensureShopOrRiderSession();
  if (!shop && !rider) {
    console.warn('[orderAlarm] skip: no shop/rider session (memory + disk)');
    return;
  }

  // Skip server reminder re-pushes while this offer/order is already ringing.
  if (isDuplicateActiveAlarm(data)) {
    console.warn(
      '[orderAlarm] skip duplicate (already ringing)',
      alarmDedupeKey(data),
    );
    return;
  }
  // Claim the slot before any await so two concurrent FCM wakes cannot
  // both pass the check and double-display. Release on failure so the
  // next reminder can retry.
  markAlarmActive(data);

  const isRider = data.alertType === ALERT_TYPE_RIDER_OFFER;
  try {
    await createNotifeeAlarmChannels();

    // Replace any previous alarm of the same type (one ringing banner max).
    try {
      await notifee.cancelNotification(
        isRider
          ? RIDER_OFFER_ALARM_NOTIFICATION_ID
          : ORDER_ALARM_NOTIFICATION_ID,
      );
    } catch { /* ignore */ }

    const orderNumber = data.orderNumber || data.order_number || '';
    const notificationId = isRider
      ? RIDER_OFFER_ALARM_NOTIFICATION_ID
      : ORDER_ALARM_NOTIFICATION_ID;
    const title = isRider ? 'Delivery offer waiting' : 'New order waiting';
    // The overlay card is the sole Accept/Reject surface for both roles now —
    // this notification only exists to trigger the FGS, so its copy must not
    // imply it can act itself (was a duplicate "same work" UI alongside the card).
    const body = orderNumber
      ? `Order ${orderNumber} waiting`
      : (isRider
        ? 'Check the offer card to accept or reject.'
        : 'Check the order card to accept or reject.');
    // Which surface can actually show this alert decides how loud the
    // notification has to be. Three states, only one of them quiet:
    //
    //  - screen off / locked  → nothing can be drawn over a dark or locked
    //    phone, so the full-screen alarm activity is the only surface there
    //    is. Without it the alert is audible and invisible: the phone rings,
    //    the rider wakes it, and there is nothing to accept.
    //  - screen on, overlay granted → the floating card is the alert. The
    //    notification stays quiet so it does not compete with it (this is the
    //    intended no-hijack behavior and it is unchanged).
    //  - screen on, overlay NOT granted (never allowed, revoked, or an older
    //    binary without the module) → the quiet channel shows nothing at all,
    //    so fall back to an ordinary heads-up banner rather than ringing at a
    //    rider with no way to see the offer.
    const screenLockedOrOff = await isScreenLockedOrOff();
    const overlayGranted = await canShowOverlay();
    let canFullScreen = true;
    try {
      if (typeof notifee.canUseFullScreenIntent === 'function') {
        canFullScreen = await notifee.canUseFullScreenIntent();
      }
    } catch {
      canFullScreen = true;
    }
    // Attached only while the device is locked or dark — that is the one state
    // where taking over the screen is the alert rather than a hijack, and the
    // one Android will auto-launch it in anyway.
    const useFullScreen = screenLockedOrOff && canFullScreen;
    const useHeadsUp = !screenLockedOrOff && !overlayGranted;
    // A full-screen intent is ignored on an IMPORTANCE_DEFAULT channel, and so
    // is a heads-up banner — both need the loud channel, which is why the quiet
    // one is reserved for the case where the floating card is doing the work.
    const loud = useFullScreen || useHeadsUp;
    const channelId = loud
      ? (isRider ? RIDER_OFFER_ALARM_CHANNEL_ID : ORDER_ALARM_CHANNEL_ID)
      : (isRider ? RIDER_OFFER_QUIET_CHANNEL_ID : ORDER_ALARM_QUIET_CHANNEL_ID);
    console.warn(
      '[orderAlarm]', loud ? 'loud alarm' : 'quiet alarm',
      isRider ? 'rider' : 'order',
      'screenLockedOrOff=', screenLockedOrOff,
      'overlayGranted=', overlayGranted,
      'canFullScreen=', canFullScreen,
      'useFullScreen=', useFullScreen,
    );

    // Google Play FGS policy requires the alert to run only as long as
    // necessary — an indefinite ring is not "user perceptible, time-bounded"
    // behavior. Rider offers already expire server-side (data.expiresAt);
    // shop-owner new-order alerts have no server expiry, so cap them at
    // MAX_ORDER_ALARM_RING_MS. Android auto-cancels the notification at this
    // time and fires EventType.DISMISSED, which already stops the alarm
    // sound + foreground service (see handleAlarmActionEvent above).
    const ringTimeoutAt = Date.now() + (isRider ? resolveRiderTimeoutMs(data) : MAX_ORDER_ALARM_RING_MS);

    const android = {
      channelId,
      // CALL only for the locked/dark case: ColorOS treats it as an incoming
      // call and lights the display, which is what has to happen for the offer
      // card to be seen at all. With the screen already on that same behavior
      // is the hijack riders complained about, so it stays MESSAGE there.
      category: useFullScreen ? AndroidCategory.CALL : AndroidCategory.MESSAGE,
      importance: loud ? AndroidImportance.HIGH : AndroidImportance.DEFAULT,
      visibility: loud ? AndroidVisibility.PUBLIC : AndroidVisibility.SECRET,
      // Rider offers open the lightweight alarm card (no nav/map); shop orders
      // open the app, where the dashboard's own popup is waiting.
      pressAction: { id: 'default', launchActivity: isRider ? ALARM_ACTIVITY : 'default' },
      // No inline Accept/Reject on either: the overlay card is the one
      // actionable surface and this notification is just the ring's host.
      // Ongoing alarm-style notification so the sound can loop until action/timeout.
      asForegroundService: true,
      foregroundServiceTypes: [
        AndroidForegroundServiceType.FOREGROUND_SERVICE_TYPE_SPECIAL_USE,
      ],
      ongoing: true,
      autoCancel: false,
      // Keeps ringing until accept/reject in both cases. Vibration and
      // screen-wake are left to the channel — driving them here too is what
      // made the card feel like a second, competing alert.
      loopSound: true,
      // Hard cap so the FGS can't ring forever — required for Play policy
      // compliance (see ringTimeoutAt above). Android fires DISMISSED at this
      // time even if the user never touches the notification.
      timeoutAfter: ringTimeoutAt,
      // Wake the display along with the full-screen card — a turnScreenOn
      // activity alone loses the race on some OEMs when the process is cold.
      ...(useFullScreen ? { lightUpScreen: true } : {}),
      // Riders land on the lightweight Accept/Reject card (no nav stack, no
      // Mapbox) so a cold locked device boots into it like an incoming call;
      // shop owners get the app, where the dashboard popup is already waiting.
      ...(useFullScreen
        ? {
          fullScreenAction: {
            id: 'default',
            launchActivity: isRider ? ALARM_ACTIVITY : 'default',
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
        total: String(data.total ?? ''),
        type: String(data.type || ''),
      },
      android: {
        ...android,
        // Force custom raw sound on the notification itself (in addition to channel).
        sound: isRider ? 'rider_alarm' : 'order_alarm',
        loopSound: true,
      },
    });

    // OEM-safe audible path: ColorOS mutes the notification stream outright
    // (channel sound included), and the media stream is whatever the rider left
    // it at — usually down. The alarm stream is the one that is actually up on
    // a phone being used for work, so the tone goes out there.
    // Shop + rider: loop until accept/reject (stop via cancel*Alarm).
    await playAlarmSound(isRider ? 'rider' : 'order', {
      untilStopped: true,
      alarmStream: true,
    });

    // The floating card is now the only visual surface for both roles, in
    // every state. Handed over unconditionally: the native module shows it
    // straight away with the screen on, and holds it until the phone is
    // unlocked when locked or dark. No-ops when "draw over other apps" was
    // never granted.
    try {
      if (overlayGranted) {
        const expiresAt = data.expiresAt || data.expires_at;
        // Shop orders have no server-side expiry — tie the card's own lifetime
        // to the ring cap so it can't outlive the alarm that announced it.
        const expiresAtMs = expiresAt
          ? new Date(expiresAt).getTime()
          : (isRider ? 0 : Date.now() + MAX_ORDER_ALARM_RING_MS);
        showOverlayOfferCard({
          orderId: String(data.orderId || data.order_id || ''),
          offerId: String(data.offerId || data.offer_id || ''),
          orderNumber: String(orderNumber),
          total: String(data.total ?? ''),
          expiresAtMs,
          badge: isRider ? 'Delivery offer' : 'New order',
          // Shop owners get one "Open app" button instead of Accept/Reject:
          // confirming an order needs the product list, delivery window and
          // slide-to-accept that only the in-app bottom sheet has. Riders
          // keep acting straight from the card — their offer is just a price
          // and a clock, and it expires.
          openOnly: !isRider,
        });
      }
    } catch { /* ignore — cosmetic overlay failure must not fail the alarm */ }

    // Proof-of-delivery for the killed-app path: the notifee alarm above just
    // rang on THIS device, so tell the server — shopAlertSweeper eases off its
    // reminder cadence once it knows the push actually landed, instead of
    // continuing to blast at full frequency as if the phone were still dark.
    // Fire-and-forget; must never block or fail the alarm display.
    if (!isRider) {
      const orderId = data.orderId || data.order_id;
      if (orderId) {
        shopApi.ackOrderAlert(orderId).catch(() => {});
      }
    }
  } catch (err) {
    clearAlarmActive(isRider ? 'rider' : 'order');
    console.warn('[orderAlarm] display failed:', err?.message || err);
  }
}

/**
 * Cancel the shop and/or rider alarm notification (and stop FGS if any).
 * Always stops the expo-audio media loop — canceling the notifee banner alone
 * does not stop that path.
 */
export async function cancelOrderAlarm() {
  if (Platform.OS !== 'android') return;
  clearAlarmActive('order');
  stopAlarmSound();
  // The order is resolved (or the app is open) — the floating card must go
  // with the ring, or it keeps offering Accept on an order already handled.
  hideOverlayOfferCard();
  try {
    await notifee.cancelNotification(ORDER_ALARM_NOTIFICATION_ID);
  } catch { /* ignore */ }
  try {
    await notifee.stopForegroundService();
  } catch { /* ignore */ }
}

export async function cancelRiderOfferAlarm() {
  if (Platform.OS !== 'android') return;
  clearAlarmActive('rider');
  stopAlarmSound();
  hideOverlayOfferCard();
  // The offer is resolved — tear down every surface showing it, including the
  // full-screen card, which otherwise survives and keeps offering Accept on an
  // offer that is already gone.
  closeAlarmScreen();
  try {
    await notifee.cancelNotification(RIDER_OFFER_ALARM_NOTIFICATION_ID);
  } catch { /* ignore */ }
  try {
    await notifee.stopForegroundService();
  } catch { /* ignore */ }
}

export async function cancelAllAlarmNotifications() {
  clearAlarmActive('all');
  await cancelOrderAlarm();
  await cancelRiderOfferAlarm();
}

/** Silence media + notifee for the alarm type on this notification (or all). */
async function silenceAlarmForAlertType(alertType) {
  if (alertType === ALERT_TYPE_RIDER_OFFER) {
    await cancelRiderOfferAlarm();
  } else if (alertType === ALERT_TYPE_NEW_ORDER) {
    await cancelOrderAlarm();
  } else {
    await cancelAllAlarmNotifications();
  }
}

/**
 * Accept/reject an alarm-type offer/order — the one code path shared by the
 * notifee action buttons, the lock-screen alarm card, and the floating
 * overlay card, regardless of which surface the tap came from.
 * @param {string} alertType — ALERT_TYPE_NEW_ORDER | ALERT_TYPE_RIDER_OFFER
 * @param {'accept'|'reject'} action
 * @param {{ orderId?: string, offerId?: string }} data
 */
export async function performOfferAction(alertType, action, data) {
  const token = await ensureBackgroundCustomerToken();
  if (!token) {
    // Cannot call API without auth — cancel ring and let user open the app.
    await silenceAlarmForAlertType(alertType);
    return;
  }

  try {
    if (alertType === ALERT_TYPE_NEW_ORDER) {
      const orderId = data.orderId || data.order_id;
      if (orderId) {
        if (action === ACTION_ACCEPT) {
          await shopApi.confirmOrder(orderId);
        } else {
          await shopApi.rejectOrder(orderId);
        }
      }
      await cancelOrderAlarm();
    } else if (alertType === ALERT_TYPE_RIDER_OFFER) {
      const offerId = data.offerId || data.offer_id;
      if (offerId) {
        if (action === ACTION_ACCEPT) {
          await riderApi.acceptOffer(offerId);
        } else {
          await riderApi.rejectOffer(offerId);
        }
      }
      await cancelRiderOfferAlarm();
    } else {
      await cancelAllAlarmNotifications();
    }
  } catch (err) {
    console.warn('[orderAlarm] action failed:', err?.message || err);
    // Still stop the ring so the user is not stuck with an endless alarm.
    await silenceAlarmForAlertType(alertType);
  }
}

/**
 * Handle Accept/Reject from the notifee action buttons.
 * Reuses shopApi / riderApi (same endpoints as dashboard UI).
 */
export async function handleAlarmActionEvent({ type, detail }) {
  const data = detail?.notification?.data || {};
  const alertType = data.alertType;

  // Swipe-dismiss / system timeout: always stop media loop.
  if (type === EventType.DISMISSED) {
    await silenceAlarmForAlertType(alertType);
    return;
  }

  if (type !== EventType.ACTION_PRESS && type !== EventType.PRESS) return;

  const pressId = detail?.pressAction?.id;

  // Tap notification body / default open: launch app but KEEP ringing until
  // Accept or Reject (shop + rider). Only action buttons silence via cancel*.
  if (type === EventType.PRESS || pressId === 'default') {
    return;
  }

  if (pressId !== ACTION_ACCEPT && pressId !== ACTION_REJECT) return;

  await performOfferAction(alertType, pressId, data);
}

/**
 * Background FCM entry point — only called from setBackgroundMessageHandler.
 */
export async function handleBackgroundAlarmMessage(remoteMessage) {
  // Structured log for device verification (adb logcat | grep orderAlarm).
  try {
    console.warn(
      '[orderAlarm] bg message',
      JSON.stringify({
        messageId: remoteMessage?.messageId,
        from: remoteMessage?.from,
        data: remoteMessage?.data || null,
        notification: remoteMessage?.notification || null,
      }),
    );
  } catch { /* ignore */ }

  const data = getRemoteAlarmData(remoteMessage);
  // Expo sometimes nests JSON under a single "body"/"data" string key.
  let alertData = data;
  if (data && !isAlarmAlertType(data.alertType)) {
    for (const key of ['body', 'message', 'payload', 'data']) {
      const raw = data[key];
      if (typeof raw === 'string' && raw.startsWith('{')) {
        try {
          const nested = JSON.parse(raw);
          if (nested && isAlarmAlertType(nested.alertType)) {
            alertData = nested;
            break;
          }
        } catch { /* ignore */ }
      }
    }
  }

  if (!alertData || !isAlarmAlertType(alertData.alertType)) {
    // Non-alarm data messages: no-op (customer/admin pushes keep title+body OS path).
    return;
  }

  // Shop/rider alert types only — never act on customer/admin notification payloads.
  // Native FCM data-only has no notification key → full notifee display.
  // Expo fallback may include title+body → sound only (avoid double banner).
  const hasOsBanner = Boolean(
    remoteMessage?.notification?.title
    || remoteMessage?.notification?.body
  );
  try {
    if (hasOsBanner) {
      // Same "already covered by the in-app popup" guard as
      // displayAlarmNotification — without it this path plays the loud
      // alarm media even while the rider is foregrounded looking at the
      // Accept/Reject popup.
      if (AppState.currentState === 'active' || await isAppForegroundRecent()) {
        console.warn('[orderAlarm] OS banner present — foreground, skip sound', alertData.alertType);
        return;
      }
      console.warn('[orderAlarm] OS banner present — sound only', alertData.alertType);
      const { playAlarmSound } = require('./alarmSound');
      await playAlarmSound(
        alertData.alertType === ALERT_TYPE_RIDER_OFFER ? 'rider' : 'order',
        { untilStopped: true, alarmStream: true },
      );
      return;
    }
    // True data-only (native FCM): full-screen notifee + media sound.
    console.warn('[orderAlarm] data-only → full-screen alarm', alertData.alertType, alertData.orderId || alertData.offerId);
    await displayAlarmNotification(alertData);
    console.warn('[orderAlarm] display complete');
  } catch (err) {
    console.warn('[orderAlarm] display failed:', err?.message || err);
  }
}

export function isAlarmPayload(data) {
  return Boolean(data && isAlarmAlertType(data.alertType));
}
