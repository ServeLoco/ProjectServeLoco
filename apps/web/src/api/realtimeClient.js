import { io } from 'socket.io-client';

const getRealtimeBaseUrl = () => {
  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
  return apiBase.replace('/api', '');
};

const ORDER_EVENTS = [
  'order.created',
  'order.cancelled',
  'order.status.updated',
  'order.payment.updated',
  'order.updated',
];

const NOTIFICATION_EVENTS = [
  'notification.created',
  'notification.unread_count.updated',
];

let socket = null;
let activeToken = null;
let connectPromise = null;
const listeners = new Map();

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
      console.warn('[realtime] listener failed', eventName, error);
    }
  });
}

export function subscribeRealtime(eventName, handler) {
  if (!eventName || typeof handler !== 'function') return () => {};
  const eventListeners = getSet(eventName);
  eventListeners.add(handler);
  return () => {
    eventListeners.delete(handler);
    if (eventListeners.size === 0) listeners.delete(eventName);
  };
}

export function subscribeOrderEvents(handler) {
  const unsubscribers = ORDER_EVENTS.map(eventName =>
    subscribeRealtime(eventName, payload => handler({ eventName, payload }))
  );
  return () => unsubscribers.forEach(unsubscribe => unsubscribe());
}

export function subscribeNotificationEvents(handler) {
  const unsubscribers = NOTIFICATION_EVENTS.map(eventName =>
    subscribeRealtime(eventName, payload => handler({ eventName, payload }))
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
  if (import.meta.env.DEV) {
    nextSocket.on('connect', () => console.log('[realtime] connected'));
    nextSocket.on('disconnect', () => console.log('[realtime] disconnected'));
  }
}

export function connectCustomerRealtime(token) {
  if (!token) return null;
  // Reuse a healthy socket for the same token.
  if (socket && activeToken === token) {
    if (!socket.connected) socket.connect();
    return socket;
  }
  // If a connection is already in flight for this token, return its promise.
  if (connectPromise && activeToken === token) {
    return connectPromise;
  }
  // Disconnect any prior socket before swapping to a new token.
  if (socket) {
    disconnectCustomerRealtime();
  }
  activeToken = token;
  const nextSocket = io(getRealtimeBaseUrl(), {
    auth: { token },
    reconnection: true,
    transports: ['websocket', 'polling'],
  });
  socket = nextSocket;
  bindSocketEvents(nextSocket);
  // Resolve once the socket has either connected or errored so concurrent
  // callers can `await` the same socket instead of racing.
  connectPromise = new Promise((resolve) => {
    const onConnect = () => {
      nextSocket.off('connect_error', onError);
      resolve(nextSocket);
    };
    const onError = () => {
      nextSocket.off('connect', onConnect);
      resolve(nextSocket);
    };
    nextSocket.once('connect', onConnect);
    nextSocket.once('connect_error', onError);
  });
  connectPromise.finally(() => {
    connectPromise = null;
  });
  return nextSocket;
}

export function disconnectCustomerRealtime() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
  }
  socket = null;
  activeToken = null;
  connectPromise = null;
}
