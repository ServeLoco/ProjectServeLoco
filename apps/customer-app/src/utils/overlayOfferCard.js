/**
 * Thin bridge to the native "draw over other apps" rider-offer card
 * (OverlayOfferModule.kt) — the floating chat-head-style card shown when
 * another app is in the foreground and screen is on. Opt-in permission;
 * every call here is a no-op when not granted or the module is missing
 * (older binary, iOS, dev client not yet rebuilt).
 */
import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

const { OverlayOfferCard, AlarmActivityBridge } = NativeModules;
const emitter = OverlayOfferCard ? new NativeEventEmitter(OverlayOfferCard) : null;

export async function canShowOverlay() {
  if (Platform.OS !== 'android' || !OverlayOfferCard) return false;
  try {
    return await OverlayOfferCard.canDrawOverlays();
  } catch {
    return false;
  }
}

/**
 * True only when the device is locked or the screen is off — the one state
 * where the full-screen alarm activity is allowed to take over the device.
 */
export async function isScreenLockedOrOff() {
  if (Platform.OS !== 'android' || !OverlayOfferCard?.isScreenLockedOrOff) return false;
  try {
    return await OverlayOfferCard.isScreenLockedOrOff();
  } catch {
    return false;
  }
}

/**
 * True while the app is actually on screen, straight from the Android activity
 * lifecycle — authoritative where the JS foreground heartbeat is stale or racy.
 */
export async function isAppOnScreen() {
  if (Platform.OS !== 'android' || !OverlayOfferCard?.isHostResumed) return false;
  try {
    return await OverlayOfferCard.isHostResumed();
  } catch {
    return false;
  }
}

export function requestOverlayPermission() {
  if (Platform.OS !== 'android' || !OverlayOfferCard) return;
  try {
    OverlayOfferCard.requestPermission();
  } catch { /* ignore */ }
}

export function showOverlayOfferCard(data) {
  if (Platform.OS !== 'android' || !OverlayOfferCard) return;
  try {
    OverlayOfferCard.show(data);
  } catch { /* ignore */ }
}

export function hideOverlayOfferCard() {
  if (Platform.OS !== 'android' || !OverlayOfferCard) return;
  try {
    OverlayOfferCard.hide();
  } catch { /* ignore */ }
}

/**
 * True while the full-screen alarm card is on screen — the alert paths skip
 * re-displaying an offer it is already showing.
 */
export async function isAlarmScreenVisible() {
  if (Platform.OS !== 'android' || !AlarmActivityBridge?.isAlarmScreenVisible) return false;
  try {
    return await AlarmActivityBridge.isAlarmScreenVisible();
  } catch {
    return false;
  }
}

/** Close the full-screen alarm card when its offer is resolved elsewhere. */
export function closeAlarmScreen() {
  if (Platform.OS !== 'android' || !AlarmActivityBridge?.closeAlarmScreen) return;
  try {
    AlarmActivityBridge.closeAlarmScreen();
  } catch { /* ignore */ }
}

/**
 * Bring the app to the front. Accept-only — rejecting an offer must leave the
 * rider in whatever app they were using.
 */
export function openMainApp() {
  if (Platform.OS !== 'android' || !AlarmActivityBridge?.openMainApp) return;
  try {
    AlarmActivityBridge.openMainApp();
  } catch { /* ignore */ }
}

/** @param {(action: {action: 'accept'|'reject', orderId?: string, offerId?: string}) => void} cb */
export function subscribeOverlayAction(cb) {
  if (!emitter) return () => {};
  const sub = emitter.addListener('OverlayOfferAction', cb);
  return () => sub.remove();
}

// Rider offers accepted on the card. Accept brings the app up before the
// accept call has landed, so for that second (longer on a slow network) the
// dashboard still holds the offer and would flash it as its slide-to-accept
// popup. Offers here are kept out of that popup: while the call is in flight,
// and for good once the server took it — a slow refresh that left before the
// accept landed must not bring it back. A failed call releases the offer, so
// the popup can still offer it if it is genuinely still open.
const cardAcceptInFlight = new Set();
const cardAccepted = new Set();
const cardAcceptListeners = new Set();

function notifyCardAccept(event) {
  cardAcceptListeners.forEach((cb) => {
    try {
      cb(event);
    } catch { /* a listener must not break the accept path */ }
  });
}

/** The card's Accept was tapped for this offer; its accept call is starting. */
export function beginCardAccept(offerId) {
  if (offerId == null || offerId === '') return;
  const key = String(offerId);
  cardAcceptInFlight.add(key);
  notifyCardAccept({ offerId: key, done: false });
}

/** That accept call ended — `accepted` is whether the server took it. */
export function endCardAccept(offerId, accepted) {
  if (offerId == null || offerId === '') return;
  const key = String(offerId);
  cardAcceptInFlight.delete(key);
  if (accepted) cardAccepted.add(key);
  notifyCardAccept({ offerId: key, done: true, accepted: Boolean(accepted) });
}

/** True while this offer's card accept is in flight, or once it succeeded. */
export function isOfferTakenByCard(offerId) {
  if (offerId == null) return false;
  const key = String(offerId);
  return cardAcceptInFlight.has(key) || cardAccepted.has(key);
}

/** @param {(event: {offerId: string, done: boolean, accepted?: boolean}) => void} cb */
export function subscribeCardAccept(cb) {
  cardAcceptListeners.add(cb);
  return () => cardAcceptListeners.delete(cb);
}
