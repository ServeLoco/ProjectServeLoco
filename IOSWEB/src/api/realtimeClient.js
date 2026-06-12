import { io } from 'socket.io-client';

// Use same host as API, but for websockets
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
const getRealtimeBaseUrl = () => API_BASE_URL.replace('/api', '');

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
  nextSocket.on('connect', () => console.log('[realtime] connected'));
  nextSocket.on('disconnect', () => console.log('[realtime] disconnected'));
}

export function connectCustomerRealtime(token) {
  if (!token) return null;
  if (socket && activeToken === token) {
    if (!socket.connected) socket.connect();
    return socket;
  }
  disconnectCustomerRealtime();
  activeToken = token;
  socket = io(getRealtimeBaseUrl(), {
    auth: { token },
    reconnection: true,
    transports: ['websocket', 'polling'],
  });
  bindSocketEvents(socket);
  return socket;
}

export function disconnectCustomerRealtime() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
  }
  socket = null;
  activeToken = null;
}
