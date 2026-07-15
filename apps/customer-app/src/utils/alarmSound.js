/**
 * Play shop/rider alarm audio through the media stack.
 *
 * ColorOS / Realme / many OEMs show the notification banner but suppress
 * notification-channel custom sounds. The same workaround as
 * notificationChime.js — play via expo-audio so the user actually hears it
 * whenever JS is running (notifee display path, warm background, foreground).
 */
import { Platform } from 'react-native';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';

let orderPlayer = null;
let riderPlayer = null;
let modeReady = false;
let loopTimer = null;

async function ensureAudioMode() {
  if (modeReady) return;
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'duckOthers',
    });
    modeReady = true;
  } catch (err) {
    console.warn('[alarmSound] setAudioModeAsync failed:', err?.message || err);
  }
}

function getPlayer(kind) {
  if (kind === 'rider') {
    if (!riderPlayer) {
      riderPlayer = createAudioPlayer(require('../../assets/sounds/rider_alarm.wav'));
    }
    return riderPlayer;
  }
  if (!orderPlayer) {
    orderPlayer = createAudioPlayer(require('../../assets/sounds/order_alarm.wav'));
  }
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

  try {
    await ensureAudioMode();
    const player = getPlayer(kind);
    player.seekTo(0);
    player.play();

    // Re-fire every ~1.1s (length of notifi.wav) while loopMs remains.
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
          return;
        }
        try {
          player.seekTo(0);
          player.play();
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
  for (const p of [orderPlayer, riderPlayer]) {
    if (!p) continue;
    try { p.pause(); } catch { /* ignore */ }
  }
}
