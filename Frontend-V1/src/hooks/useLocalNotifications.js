import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
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

async function requestPermission() {
  if (Platform.OS === 'android' && Platform.Version < 33) {
    // Android < 13 doesn't need runtime permission for notifications
    return true;
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;

  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
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
  const responseListener = useRef(null);
  const permissionGranted = useRef(false);

  // ── 1. One-time setup: permissions + Android channel ─────────────────────
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const granted = await requestPermission();
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
      if (!permissionGranted.current) return;

      const title = payload?.title ?? 'ServeLoco';
      const body  = payload?.body  ?? payload?.message ?? '';
      const orderId = extractOrderId(payload);

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
    });

    return () => unsubscribe();
  }, [isAuthenticated]);

  // ── 3. Handle tap on notification → navigate to OrderDetail ──────────────
  useEffect(() => {
    responseListener.current =
      Notifications.addNotificationResponseReceivedListener(response => {
        const orderId =
          response.notification.request.content.data?.orderId;

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
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, [navigationRef]);
}
