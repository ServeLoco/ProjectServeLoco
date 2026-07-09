import { io } from 'socket.io-client';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { getRealtimeBaseUrl } from './realtimeConfig';

const ORDER_EVENTS = [
  'order.created',
  'order.cancelled',
  'order.status.updated',
  'order.payment.updated',
  'order.updated',
  'shop.order.assigned',
];

const NOTIFICATION_EVENTS = [
  'notification.created',
  'notification.unread_count.updated',
];

const LIFECYCLE_EVENTS = [
  'connected',
  'reconnected',
  'disconnected',
  'foreground',
];

let socket = null;
let activeToken = null;
let hasConnected = false;

const listeners = new Map();

function debugLog(...args) {
  if (__DEV__) {
    console.log('[realtime]', ...args);
  }
}

function getSet(eventName) {
  if (!listeners.has(eventName)) {
    listeners.set(eventName, new Set());
  }
  return listeners.get(eventName);
}

function emitLocal(eventName, payload) {
  const eventListeners = listeners.get(eventName);
  if (!eventListeners) return;

  eventListeners.forEach(handler => {
    try {
      handler(payload);
    } catch (error) {
      if (__DEV__) {
        console.warn('[realtime] listener failed', eventName, error);
      }
    }
  });
}

function subscribeRealtime(eventName, handler) {
  if (!eventName || typeof handler !== 'function') {
    return () => {};
  }

  const eventListeners = getSet(eventName);
  eventListeners.add(handler);

  return () => {
    eventListeners.delete(handler);
    if (eventListeners.size === 0) {
      listeners.delete(eventName);
    }
  };
}

function subscribeOrderEvents(handler) {
  const unsubscribers = ORDER_EVENTS.map(eventName =>
    subscribeRealtime(eventName, payload => handler({ eventName, payload }))
  );

  return () => unsubscribers.forEach(unsubscribe => unsubscribe());
}

function subscribeNotificationEvents(handler) {
  const unsubscribers = NOTIFICATION_EVENTS.map(eventName =>
    subscribeRealtime(eventName, payload => handler({ eventName, payload }))
  );

  return () => unsubscribers.forEach(unsubscribe => unsubscribe());
}

function subscribeRealtimeLifecycle(handler) {
  const unsubscribers = LIFECYCLE_EVENTS.map(eventName =>
    subscribeRealtime(`lifecycle.${eventName}`, payload => handler({ eventName, payload }))
  );

  return () => unsubscribers.forEach(unsubscribe => unsubscribe());
}

function bindSocketEvents(nextSocket) {
  ORDER_EVENTS.forEach(eventName => {
    nextSocket.on(eventName, payload => emitLocal(eventName, payload));
  });

  NOTIFICATION_EVENTS.forEach(eventName => {
    nextSocket.on(eventName, payload => emitLocal(eventName, payload));
  });

  nextSocket.on('connect', () => {
    const lifecycleEvent = hasConnected ? 'reconnected' : 'connected';
    hasConnected = true;
    emitLocal(`lifecycle.${lifecycleEvent}`, {
      socketId: nextSocket.id,
      connected: true,
    });
    debugLog(lifecycleEvent);
  });

  nextSocket.on('disconnect', reason => {
    emitLocal('lifecycle.disconnected', {
      reason,
      connected: false,
    });
    debugLog('disconnected', reason);
  });

  nextSocket.on('connect_error', error => {
    debugLog('connect_error', error?.message || error);
  });
}

function connectCustomerRealtime(token) {
  if (!token) return null;

  if (socket && activeToken === token) {
    if (!socket.connected) socket.connect();
    return socket;
  }

  disconnectCustomerRealtime();

  activeToken = token;
  hasConnected = false;
  // Extend the auth payload with platform + appVersion for the analytics
  // presence tracker (Task 2). Do not change anything else about connection
  // handling — the server's authenticateSocket only reads `token`.
  const appVersion = Constants.expoConfig?.version || Constants.manifest?.version || null;
  socket = io(getRealtimeBaseUrl(), {
    auth: { token, platform: Platform.OS, appVersion },
    reconnection: true,
    transports: ['websocket', 'polling'],
  });

  bindSocketEvents(socket);
  return socket;
}

function disconnectCustomerRealtime() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
  }

  socket = null;
  activeToken = null;
  hasConnected = false;
}

function emitRealtimeForeground() {
  emitLocal('lifecycle.foreground', {
    connected: Boolean(socket?.connected),
  });
}

function getRealtimeConnectionState() {
  return {
    connected: Boolean(socket?.connected),
    hasSocket: Boolean(socket),
  };
}

// Emit an analytics screen-change event on the connected socket. Silently
// no-ops if the socket isn't connected — analytics is fire-and-forget.
function emitAnalyticsScreen(screen) {
  if (!socket || !socket.connected || !screen) return;
  try {
    socket.emit('analytics:screen', { screen });
  } catch (_) {
    // never throw from analytics
  }
}

export {
  connectCustomerRealtime,
  disconnectCustomerRealtime,
  emitAnalyticsScreen,
  emitRealtimeForeground,
  getRealtimeConnectionState,
  subscribeNotificationEvents,
  subscribeOrderEvents,
  subscribeRealtime,
  subscribeRealtimeLifecycle,
};
