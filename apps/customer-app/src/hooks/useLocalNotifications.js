import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { subscribeNotificationEvents } from '../api/realtimeClient';
import { authApi } from '../api/authApi';
import { useAuthStore } from '../stores';

// Expo project ID from app.json — used to get a valid push token.
const EXPO_PROJECT_ID =
  Constants.expoConfig?.extra?.eas?.projectId ??
  '1df5a9bf-de34-48ea-96f4-68f598d7d318';

// When the app is in the foreground, suppress remote push banners (APNs/FCM)
// but allow local scheduled notifications (from the socket path) through.
// trigger.type === 'push' means the OS delivered it via APNs/FCM; local ones
// scheduled via scheduleNotificationAsync have trigger === null.
// When the app is backgrounded/closed the OS delivers push directly without
// calling this handler at all, so the banner always appears.
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const isRemotePush = notification?.request?.trigger?.type === 'push';
    return {
      shouldShowBanner: !isRemotePush,
      shouldShowList: !isRemotePush,
      shouldPlaySound: !isRemotePush,
      shouldSetBadge: true,
    };
  },
});

// ─── helpers ────────────────────────────────────────────────────────────────

const PERMISSION_ASKED_KEY = 'serveloco:notifPermissionAsked';

// Module-level cache so we only hit AsyncStorage once per process.
let askedStateCache = null;
export const readAskedState = async () => {
  if (askedStateCache !== null) return askedStateCache;
  try {
    const raw = await AsyncStorage.getItem(PERMISSION_ASKED_KEY);
    askedStateCache = raw ? JSON.parse(raw) : { asked: false, decided: false };
  } catch {
    askedStateCache = { asked: false, decided: false };
  }
  return askedStateCache;
};
const writeAskedState = async (next) => {
  askedStateCache = next;
  try {
    await AsyncStorage.setItem(PERMISSION_ASKED_KEY, JSON.stringify(next));
  } catch { /* best-effort */ }
};

export async function checkNotificationPermission() {
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted';
}

/**
 * Request notification permission exactly once per install/session, while the
 * app is authenticated. Idempotent — safe to call from multiple places
 * (login, signup, order-detail screen).
 *
 * Returns one of:
 *   'granted' | 'denied' | 'undetermined' | 'unsupported'
 *
 * Never throws. Never shows a custom UI; iOS and Android 13+ show their own
 * native system dialogs.
 */
export async function requestNotificationPermission() {
  // Android <13 doesn't need a runtime grant — auto-granted at install.
  if (Platform.OS === 'android' && Platform.Version < 33) {
    return 'granted';
  }

  try {
    const existing = await Notifications.getPermissionsAsync();
    const state = await readAskedState();

    // If the user already responded to the prompt, respect that decision and
    // only re-check the live status (which can change via system Settings).
    if (state.asked) {
      return existing.status === 'granted' ? 'granted'
           : existing.status === 'denied'  ? 'denied'
           : 'undetermined';
    }

    // First time — record that we're about to ask so we don't ask again even
    // if the user dismisses without choosing.
    await writeAskedState({ asked: true, decided: false });

    const { status } = await Notifications.requestPermissionsAsync();
    await writeAskedState({ asked: true, decided: status !== 'undetermined' });
    return status === 'granted' ? 'granted'
         : status === 'denied'  ? 'denied'
         : 'undetermined';
  } catch (err) {
    console.warn('[notifications] requestNotificationPermission failed:', err?.message || err);
    return 'unsupported';
  }
}

/**
 * Reset the "asked" flag — used by Settings / a future "enable notifications" CTA
 * so a user who previously declined can re-trigger the system prompt.
 */
export async function resetNotificationAskedFlag() {
  await writeAskedState({ asked: false, decided: false });
}

const BRAND_COLOR = '#FF7A3A';

async function createAndroidChannel() {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync('serveloco-orders', {
    name: 'Order Updates',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    sound: 'default',
    lightColor: BRAND_COLOR,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: false,
  });
}

// Register the "order_update" category so Android and iOS show a
// "View Order" action button in the expanded notification without the
// user having to open the app first.
async function registerNotificationCategories() {
  try {
    await Notifications.setNotificationCategoryAsync('order_update', [
      {
        identifier: 'view_order',
        buttonTitle: '📦 View Order',
        options: { opensAppToForeground: true },
      },
    ]);
  } catch {
    // Not all environments support categories (e.g. Expo Go on Android < 8).
  }
}

function parseActionPayload(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function extractOrderId(payload) {
  const actionPayload = parseActionPayload(
    payload?.actionPayload ?? payload?.action_payload,
  );
  const fromAction =
    actionPayload?.orderId || actionPayload?.order_id;
  if (fromAction) return String(fromAction);

  const isOrderSource =
    String(payload?.sourceType || payload?.source_type || '').toLowerCase() ===
    'order';
  if (isOrderSource && payload?.sourceId) return String(payload.sourceId);

  return null;
}

// ─── hook ────────────────────────────────────────────────────────────────────

/**
 * useLocalNotifications
 *
 * Bridges incoming Socket.io "notification.created" events to the
 * phone's native notification bar. Also handles navigation when the
 * user taps a notification.
 *
 * @param {React.MutableRefObject} navigationRef - ref to the NavigationContainer
 */
export function useLocalNotifications(navigationRef) {
  const isAuthenticated = useAuthStore(state => state.isAuthenticated);
  const permissionGranted = useRef(false);

  // ── 1. One-time setup: Android channel, notification categories ──────────
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const granted = await checkNotificationPermission();
      if (!cancelled) permissionGranted.current = granted;
      await createAndroidChannel();
      await registerNotificationCategories();
    })();

    return () => { cancelled = true; };
  }, []);

  // ── 1b. On login: request permission (shows system dialog first time) then
  //        register / refresh the Expo push token with the server.
  // Runs every time isAuthenticated flips to true (login, app reopen).
  // requestNotificationPermission is idempotent — it only calls the system
  // dialog once; subsequent calls just return the current status.
  useEffect(() => {
    if (!isAuthenticated) return;

    let cancelled = false;
    (async () => {
      try {
        const status = await requestNotificationPermission();
        if (status !== 'granted' || cancelled) return;

        const tokenObj = await Notifications.getExpoPushTokenAsync({
          projectId: EXPO_PROJECT_ID,
        });
        const token = tokenObj?.data;
        if (!token || cancelled) return;

        await authApi.registerPushToken(token);
      } catch (err) {
        // Non-fatal — the app works fine without push tokens registered.
        console.warn('[useLocalNotifications] push token registration failed:', err?.message || err);
      }
    })();

    return () => { cancelled = true; };
  }, [isAuthenticated]);

  // ── 2. Listen for realtime "notification.created" events ─────────────────
  useEffect(() => {
    if (!isAuthenticated) return undefined;

    const unsubscribe = subscribeNotificationEvents(async ({ eventName, payload }) => {
      if (eventName !== 'notification.created') return;

      // Check permission every time (user might grant it later)
      const hasPermission = await checkNotificationPermission();
      console.log('[useLocalNotifications] Permission status:', hasPermission);
      console.log('[useLocalNotifications] Notification payload:', payload);

      if (!hasPermission) {
        console.log('[useLocalNotifications] No permission, skipping notification');
        return;
      }

      const title = payload?.title ?? 'ServeLoco';
      const body  = payload?.body  ?? payload?.message ?? '';
      const orderId = extractOrderId(payload);

      console.log('[useLocalNotifications] Scheduling notification:', { title, body, orderId });

      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          sound: 'default',
          data: { orderId },
          // Show "View Order" action button in the expanded notification
          // when the notification relates to an order.
          ...(orderId ? { categoryIdentifier: 'order_update' } : {}),
          ...(Platform.OS === 'android' && {
            channelId: 'serveloco-orders',
            // Tint the notification icon with the brand saffron color.
            color: BRAND_COLOR,
          }),
        },
        trigger: null, // fire immediately
      });

      console.log('[useLocalNotifications] Notification scheduled successfully');
    });

    return () => unsubscribe();
  }, [isAuthenticated]);

  // ── 3. Handle tap / action button → navigate to OrderDetail ─────────────
  // Fires for both a direct tap (DEFAULT_ACTION_IDENTIFIER) and the
  // "View Order" action button ('view_order'). Any other future actions
  // (e.g. "Dismiss") that set opensAppToForeground=false would need a
  // separate check here before navigating.
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      const orderId = response.notification.request.content.data?.orderId;
      if (!orderId) return;

      // Wait for navigator to be ready before navigating
      const tryNavigate = () => {
        if (navigationRef?.current?.isReady()) {
          navigationRef.current.navigate('OrderDetail', { orderId });
        } else {
          setTimeout(tryNavigate, 200);
        }
      };

      tryNavigate();
    });

    return () => {
      subscription.remove();
    };
  }, [navigationRef]);
}
