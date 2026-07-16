/**
 * Play shop/rider alarm audio through the media stack.
 *
 * ColorOS often mutes notification-channel sounds. We play via expo-audio and
 * always vibrate. Source resolution order:
 *  1) expo-asset localUri (warm JS / Metro — most reliable for dev)
 *  2) android.resource raw URI (headless / no Metro)
 *  3) require() module (last resort)
 */
import { Platform, Vibration } from 'react-native';
import { Asset } from 'expo-asset';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import Constants from 'expo-constants';

let orderPlayer = null;
let riderPlayer = null;
let modeReady = false;
let loopTimer = null;

const ANDROID_PACKAGE =
  Constants.expoConfig?.android?.package || 'com.yashsiwach.villkro';

const SOUND_MODULE = {
  order: require('../../assets/sounds/order_alarm.wav'),
  rider: require('../../assets/sounds/rider_alarm.wav'),
};

function rawResourceUri(name) {
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
      // Route as media so volume keys + media stream work on ColorOS.
      playsInSilentModeIOS: true,
    });
    modeReady = true;
  } catch (err) {
    console.warn('[alarmSound] setAudioModeAsync failed:', err?.message || err);
  }
}

async function resolveSource(kind) {
  const mod = SOUND_MODULE[kind] || SOUND_MODULE.order;
  // 1) Packaged asset → on-disk file (best for warm main JS / Metro).
  try {
    const asset = Asset.fromModule(mod);
    if (!asset.localUri) {
      await asset.downloadAsync();
    }
    if (asset.localUri) {
      return { uri: asset.localUri };
    }
  } catch (err) {
    console.warn('[alarmSound] asset localUri failed:', err?.message || err);
  }
  // 2) APK res/raw (headless FCM — no Metro HTTP).
  try {
    const rawName = kind === 'rider' ? 'rider_alarm' : 'order_alarm';
    return { uri: rawResourceUri(rawName) };
  } catch (err) {
    console.warn('[alarmSound] raw uri failed:', err?.message || err);
  }
  // 3) Direct require module.
  return mod;
}

async function createPlayer(kind) {
  const source = await resolveSource(kind);
  try {
    return createAudioPlayer(source);
  } catch (err) {
    console.warn('[alarmSound] createAudioPlayer failed:', err?.message || err, source);
    return null;
  }
}

async function getPlayer(kind) {
  if (kind === 'rider') {
    if (!riderPlayer) riderPlayer = await createPlayer('rider');
    return riderPlayer;
  }
  if (!orderPlayer) orderPlayer = await createPlayer('order');
  return orderPlayer;
}

/**
 * Play the alarm tone immediately and loop.
 *
 * @param {'order'|'rider'} kind
 * @param {{
 *   loopMs?: number,
 *   untilStopped?: boolean,
 * }} [opts]
 *   - untilStopped: true → loop until stopAlarmSound() (accept/reject).
 *   - loopMs: finite ms cap (rider offer expiry). 0 = play once, no loop.
 *   - default loopMs 20000 if neither set.
 */
export async function playAlarmSound(kind = 'order', opts = {}) {
  if (Platform.OS !== 'android') return;
  const untilStopped = opts.untilStopped === true;
  const loopMs = untilStopped
    ? Infinity
    : (opts.loopMs !== undefined ? opts.loopMs : 20_000);

  console.warn(
    '[alarmSound] play start',
    kind,
    untilStopped ? 'untilStopped' : `loopMs=${loopMs}`,
  );

  // Always buzz — even if audio fails.
  try {
    Vibration.vibrate(
      kind === 'rider'
        ? [0, 600, 200, 600, 200, 600, 200, 600]
        : [0, 500, 200, 500, 200, 500, 200, 500],
    );
  } catch { /* ignore */ }

  try {
    await ensureAudioMode();
    const player = await getPlayer(kind);
    if (!player) {
      console.warn('[alarmSound] no player — vibration only');
      // Still re-buzz until stopped when untilStopped.
      if (loopTimer) {
        clearInterval(loopTimer);
        loopTimer = null;
      }
      if (untilStopped || (Number.isFinite(loopMs) && loopMs > 0)) {
        const started = Date.now();
        loopTimer = setInterval(() => {
          if (Number.isFinite(loopMs) && Date.now() - started >= loopMs) {
            clearInterval(loopTimer);
            loopTimer = null;
            try { Vibration.cancel(); } catch { /* ignore */ }
            return;
          }
          try {
            Vibration.vibrate(kind === 'rider' ? [0, 500] : [0, 400]);
          } catch { /* ignore */ }
        }, 1100);
      }
      return;
    }
    try {
      player.seekTo(0);
    } catch { /* ignore */ }
    player.play();
    console.warn('[alarmSound] play() called ok');

    if (loopTimer) {
      clearInterval(loopTimer);
      loopTimer = null;
    }
    // loopMs === 0 → single shot only.
    if (loopMs === 0) return;

    const started = Date.now();
    loopTimer = setInterval(() => {
      if (Number.isFinite(loopMs) && Date.now() - started >= loopMs) {
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
        Vibration.vibrate(kind === 'rider' ? [0, 500] : [0, 400]);
      } catch { /* ignore */ }
    }, 1100);
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
