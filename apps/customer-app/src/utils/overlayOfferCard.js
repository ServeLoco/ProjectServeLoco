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
