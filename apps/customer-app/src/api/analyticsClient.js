// Analytics client for the customer app.
// - trackScreen(name) emits `analytics:screen` on the existing socket (no-op
//   if disconnected).
// - trackEvent(type, payload) pushes into an in-memory queue. Flush via POST
//   /analytics/events when: 15s elapsed since first queued event, OR queue
//   reaches 20, OR app goes to background. Failed flush: retry once on next
//   flush, then drop. NEVER persists to disk, NEVER blocks UI, NEVER throws.
//   If the API is down, events are silently dropped — analytics is fire-and-
//   forget (Rule 7).

import { AppState } from 'react-native';
import { emitAnalyticsScreen } from './realtimeClient';
import { apiClient } from './httpClient';

const MAX_QUEUE = 20;
const FLUSH_INTERVAL_MS = 15_000;

let queue = [];
let flushTimer = null;
let needsRetry = false;
let appStateSubscription = null;

function clearFlushTimer() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushEvents().catch(() => {});
  }, FLUSH_INTERVAL_MS);
}

async function flushEvents() {
  if (queue.length === 0) return;

  const batch = queue.splice(0, queue.length);

  try {
    await apiClient.post('/analytics/events', { events: batch }, { auth: 'customer' });
    needsRetry = false;
  } catch (_) {
    // Retry once: put the batch back for the next flush. If this is already
    // a retry (needsRetry was true), drop the batch — never loop forever.
    if (!needsRetry) {
      needsRetry = true;
      queue = [...batch, ...queue];
    } else {
      needsRetry = false;
    }
  }
}

function trackScreen(name) {
  if (!name || typeof name !== 'string') return;
  try {
    emitAnalyticsScreen(name);
  } catch (_) {
    // never throw from analytics
  }
}

function trackEvent(type, payload = {}) {
  try {
    queue.push({ type, ...payload, at: new Date().toISOString() });

    if (queue.length >= MAX_QUEUE) {
      flushEvents().catch(() => {});
      clearFlushTimer();
    } else {
      scheduleFlush();
    }
  } catch (_) {
    // never throw from analytics
  }
}

function resetAnalytics() {
  queue = [];
  needsRetry = false;
  clearFlushTimer();
}

function initAnalytics() {
  // Flush on background so events aren't lost when the user switches apps.
  if (appStateSubscription) return;
  appStateSubscription = AppState.addEventListener('change', (nextState) => {
    if (nextState === 'background' || nextState === 'inactive') {
      flushEvents().catch(() => {});
      clearFlushTimer();
    }
  });
}

function stopAnalytics() {
  clearFlushTimer();
  if (appStateSubscription) {
    appStateSubscription.remove();
    appStateSubscription = null;
  }
  queue = [];
  needsRetry = false;
}

export { trackScreen, trackEvent, flushEvents, resetAnalytics, initAnalytics, stopAnalytics };
