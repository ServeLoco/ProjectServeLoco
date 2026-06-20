import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { subscribeNotificationEvents } from '../api/realtimeClient';
import { useAuthStore } from '../stores';

// Configure how notifications are presented when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,   // show banner even when app is open
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// ─── helpers ────────────────────────────────────────────────────────────────

const PERMISSION_ASKED_KEY = 'serveloco:notifPermissionAsked';

// Module-level cache so we only hit AsyncStorage once per process.
let askedStateCache = null;
const readAskedState = async () => {
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

async function createAndroidChannel() {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync('serveloco-orders', {
    name: 'Order Updates',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    sound: 'default',
    lightColor: '#FF6B35',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: false,
  });
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

  // ── 1. One-time setup: Android channel only (no permission request) ─────
  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Check if permission is already granted
      const granted = await checkNotificationPermission();
      if (!cancelled) permissionGranted.current = granted;
      await createAndroidChannel();
    })();

    return () => {
      cancelled = true;
    };
  }, []);

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
          ...(Platform.OS === 'android' && {
            channelId: 'serveloco-orders',
          }),
        },
        trigger: null, // fire immediately
      });

      console.log('[useLocalNotifications] Notification scheduled successfully');
    });

    return () => unsubscribe();
  }, [isAuthenticated]);

  // ── 3. Handle tap on notification → navigate to OrderDetail ──────────────
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
