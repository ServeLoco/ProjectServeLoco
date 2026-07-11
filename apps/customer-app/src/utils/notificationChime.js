import { Platform } from 'react-native';
import { createAudioPlayer } from 'expo-audio';

// Some Android OEM skins (ColorOS/OxygenOS/MIUI) show the banner but
// suppress the notification channel sound when the posting app is in the
// foreground. Local notifications (the socket-bridged order updates and the
// shop-owner new-order alert) only ever fire while the app is foregrounded,
// so on those devices they were always silent. Playing the chime directly
// through the audio stack sidesteps the OEM notification-sound policy.
//
// Android-only: on iOS the notification handler's shouldPlaySound already
// plays the system sound reliably, and adding this would double-chime.
// Background/killed delivery is remote push — the OS plays the channel
// sound there, no JS runs, so this never double-fires with it either.
let player = null;

export function playNotificationChime() {
  if (Platform.OS !== 'android') return;
  try {
    if (!player) {
      player = createAudioPlayer(require('../../assets/sounds/order-chime.wav'));
    }
    player.seekTo(0);
    player.play();
  } catch (err) {
    // Best-effort — a broken chime should never break the notification flow.
    console.warn('[notificationChime] failed to play:', err?.message || err);
  }
}
