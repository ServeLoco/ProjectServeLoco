/**
 * Play shop/rider alarm audio through the media stack.
 *
 * ColorOS / Realme mute notification-channel custom sounds often. We play via
 * expo-audio. In headless FCM JS, `require(asset)` can resolve to a Metro HTTP
 * URL that 404s — prefer the packaged raw resource URI that always exists in
 * the APK (res/raw/order_alarm.wav → android.resource://…/raw/order_alarm).
 */
import { Platform, Vibration } from 'react-native';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import Constants from 'expo-constants';

let orderPlayer = null;
let riderPlayer = null;
let modeReady = false;
let loopTimer = null;

const ANDROID_PACKAGE =
  Constants.expoConfig?.android?.package || 'com.yashsiwach.villkro';

function rawResourceUri(name) {
  // Android drops the extension for res/raw names.
  return `android.resource://${ANDROID_PACKAGE}/raw/${name}`;
}

async function ensureAudioMode() {
  if (modeReady) return;
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'duckOthers',
      allowsRecording: false,
    });
    modeReady = true;
  } catch (err) {
    console.warn('[alarmSound] setAudioModeAsync failed:', err?.message || err);
  }
}

function createPlayer(kind) {
  const rawName = kind === 'rider' ? 'rider_alarm' : 'order_alarm';
  // 1) Preferred: APK raw resource (works in headless / no Metro).
  try {
    return createAudioPlayer({ uri: rawResourceUri(rawName) });
  } catch (err) {
    console.warn('[alarmSound] raw uri player failed:', err?.message || err);
  }
  // 2) Fallback: bundled asset via Metro/require (foreground only).
  try {
    if (kind === 'rider') {
      return createAudioPlayer(require('../../assets/sounds/rider_alarm.wav'));
    }
    return createAudioPlayer(require('../../assets/sounds/order_alarm.wav'));
  } catch (err) {
    console.warn('[alarmSound] require() player failed:', err?.message || err);
    return null;
  }
}

function getPlayer(kind) {
  if (kind === 'rider') {
    if (!riderPlayer) riderPlayer = createPlayer('rider');
    return riderPlayer;
  }
  if (!orderPlayer) orderPlayer = createPlayer('order');
  return orderPlayer;
}

/**
 * Play the alarm tone immediately, optionally looping for a short window.
 * @param {'order'|'rider'} kind
 * @param {{ loopMs?: number }} [opts]
 */
export async function playAlarmSound(kind = 'order', opts = {}) {
  if (Platform.OS !== 'android') return;
  const loopMs = opts.loopMs ?? 20000;

  // Always buzz — even if audio fails (OEM silent mode / 404 asset).
  try {
    Vibration.vibrate(
      kind === 'rider'
        ? [0, 600, 200, 600, 200, 600]
        : [0, 500, 200, 500, 200, 500],
    );
  } catch { /* ignore */ }

  try {
    await ensureAudioMode();
    const player = getPlayer(kind);
    if (!player) {
      console.warn('[alarmSound] no player available');
      return;
    }
    try {
      player.seekTo(0);
    } catch { /* some sources ignore seek */ }
    player.play();

    if (loopTimer) {
      clearInterval(loopTimer);
      loopTimer = null;
    }
    if (loopMs > 0) {
      const started = Date.now();
      loopTimer = setInterval(() => {
        if (Date.now() - started >= loopMs) {
          clearInterval(loopTimer);
          loopTimer = null;
          try { player.pause(); } catch { /* ignore */ }
          try { Vibration.cancel(); } catch { /* ignore */ }
          return;
        }
        try {
          player.seekTo(0);
          player.play();
        } catch { /* ignore */ }
        try {
          Vibration.vibrate(kind === 'rider' ? [0, 400] : [0, 350]);
        } catch { /* ignore */ }
      }, 1100);
    }
  } catch (err) {
    console.warn('[alarmSound] play failed:', err?.message || err);
  }
}

export function stopAlarmSound() {
  if (loopTimer) {
    clearInterval(loopTimer);
    loopTimer = null;
  }
  try { Vibration.cancel(); } catch { /* ignore */ }
  for (const p of [orderPlayer, riderPlayer]) {
    if (!p) continue;
    try { p.pause(); } catch { /* ignore */ }
  }
}
