import { registerRootComponent } from 'expo';
import { Platform } from 'react-native';
import notifee from '@notifee/react-native';
import messaging from '@react-native-firebase/messaging';
import App from './App';
import {
  handleBackgroundAlarmMessage,
  handleAlarmActionEvent,
  isAlarmPayload,
} from './src/utils/orderAlarmNotifications';

// ── Background FCM handler (Android killed/background alarm path) ──────────
// MUST be registered at the top level before AppRegistry, and ONLY here —
// never from a BOOT_COMPLETED / REBOOT receiver. Starting a restricted
// foreground service from a boot receiver crashes on Android 15+.
// This path is reachable solely when an FCM data message arrives.
if (Platform.OS === 'android') {
  // Required for android.asForegroundService notifications (ongoing alarm).
  // The promise stays pending until stopForegroundService() is called.
  notifee.registerForegroundService(() => new Promise(() => {}));

  messaging().setBackgroundMessageHandler(async (remoteMessage) => {
    await handleBackgroundAlarmMessage(remoteMessage);
  });

  // Notifee action buttons (Accept / Reject) while the process is in background.
  notifee.onBackgroundEvent(async (event) => {
    await handleAlarmActionEvent(event);
  });
}

// Foreground FCM listener: alarm-type payloads no-op here so we do not
// double-ring with useNewOrderAlert / useRiderOfferAlert (socket path).
// Non-alarm FCM (if any) is also ignored — expo-notifications handles
// customer/admin title+body pushes.
if (Platform.OS === 'android') {
  // Deferred so we don't attach until the JS runtime is ready; still
  // registered before first paint via this top-level module eval.
  messaging().onMessage(async (remoteMessage) => {
    const data = remoteMessage?.data;
    if (isAlarmPayload(data)) {
      // Foreground: existing 8s chime/vibrate hooks own the UX.
      return;
    }
    // Non-alarm: no-op (expo-notifications / socket path).
  });
}

registerRootComponent(App);
