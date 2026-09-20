import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import { riderApi } from '../api/riderApi';
import { ensureBackgroundCustomerToken, ensureShopOrRiderSession } from '../utils/orderAlarmNotifications';
import { IDLE_PING_INTERVAL_MS } from '../utils/riderTracking';

// Defined at module scope (before AppRegistry, mirrors index.js's FCM
// background handler pattern) — TaskManager requires the task to exist
// before startLocationUpdatesAsync is ever called, on every JS load
// including the background-only relaunches Android/iOS use to deliver
// location updates while the app is not in the foreground.
export const RIDER_BACKGROUND_LOCATION_TASK = 'rider-background-location';

// startLocationUpdatesAsync's `timeInterval` is Android-only (expo-location
// LocationTaskOptions: "@platform android"). iOS ignores it and honours only
// `distanceInterval`, which is deliberately 0 here so a STATIONARY rider
// still reports and doesn't age out of the server's
// RIDER_LOCATION_MAX_AGE_SEC window. The two together mean iOS delivers a
// fix on essentially every location change — so without this throttle a
// backgrounded iOS rider POSTs continuously instead of once per interval,
// burning battery and hammering the endpoint.
//
// Throttling the POST (rather than raising distanceInterval) keeps the
// stationary-rider guarantee intact and leaves Android byte-for-byte
// unchanged: its fixes already arrive ~IDLE_PING_INTERVAL_MS apart, so the
// window below is already elapsed every time and this never skips one. The
// 10% slack absorbs Android timer jitter firing a touch early.
const MIN_POST_INTERVAL_MS = IDLE_PING_INTERVAL_MS * 0.9;
let lastPostAtMs = 0;

/**
 * Tear the registration down from inside the task.
 *
 * Location updates outlive the JS that started them: they are registered with
 * Android, not with the React tree. So once a rider signs out, loses the rider
 * role, or force-closes the app, nothing ever calls stop() — Android keeps
 * waking the process for this task forever. Each of those wake-ups is a
 * headless relaunch, and expo-task-manager NPEs inside
 * TaskService.executeTask when it cannot resolve an app record for one
 * (Play Console's top crash: 35.7% of all events, the same two users again and
 * again, because nothing ever broke the loop). Unregistering on the first
 * wake-up that finds no session is what breaks it.
 */
// "No session" is not proof. Both the token lookup and the rider lookup fall
// back to reading AsyncStorage, and a read that FAILS is indistinguishable
// from one that succeeds and finds nothing — both come back empty. Acting on a
// single empty answer would let one transient storage blip permanently stop a
// working rider from sharing location, which is worse than the crash loop this
// guards against. Three in a row is still ~4 minutes, which ends the loop long
// before it can rack up the ten crashes Play Console recorded.
const STOP_AFTER_CONSECUTIVE_MISSES = 3;
let consecutiveMisses = 0;

async function stopSelfAfterRepeatedMisses(reason) {
  consecutiveMisses += 1;
  if (consecutiveMisses < STOP_AFTER_CONSECUTIVE_MISSES) {
    console.warn(
      `[riderBackgroundLocationTask] ${reason} (${consecutiveMisses}/${STOP_AFTER_CONSECUTIVE_MISSES})`
    );
    return;
  }
  try {
    const started = await Location.hasStartedLocationUpdatesAsync(RIDER_BACKGROUND_LOCATION_TASK);
    if (started) await Location.stopLocationUpdatesAsync(RIDER_BACKGROUND_LOCATION_TASK);
    console.warn('[riderBackgroundLocationTask] unregistered:', reason);
  } catch (_) {
    // Nothing else to try — if this throws the registration is already gone.
  }
}

TaskManager.defineTask(RIDER_BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  // Everything below runs on a headless JS relaunch where nothing else will
  // catch a throw, and an uncaught one here surfaces as an app crash.
  try {
    if (error) {
      console.warn('[riderBackgroundLocationTask]', error.message || error);
      return;
    }
    const locations = data?.locations;
    const point = Array.isArray(locations) ? locations[locations.length - 1] : null;
    const coords = point?.coords;
    if (!coords) return;

    const now = Date.now();
    if (now - lastPostAtMs < MIN_POST_INTERVAL_MS) return;
    // Claimed before the await so a burst of iOS fixes delivered back-to-back
    // can't all pass the check while the first POST is still in flight.
    lastPostAtMs = now;

    // A background-only JS relaunch never runs App.js's
    // setCustomerTokenProvider(() => useAuthStore.getState().token) — the
    // zustand-persist store may still be mid-hydration (or never started)
    // when this task fires, so httpClient's token resolution would silently
    // send no Authorization header and 401. Same persisted-token fallback
    // the FCM background handler already uses for the same gap.
    const token = await ensureBackgroundCustomerToken();
    if (!token) {
      await stopSelfAfterRepeatedMisses('signed out');
      return;
    }

    // Signed in, but no longer a rider — the role can be taken away server
    // side, and the phone would otherwise keep reporting a position for an
    // account that can never be offered a delivery again.
    const { rider } = await ensureShopOrRiderSession();
    if (!rider) {
      await stopSelfAfterRepeatedMisses('not a rider');
      return;
    }

    // A good fix clears the strike count — misses only matter consecutively.
    consecutiveMisses = 0;
    await riderApi.updateLocation(coords.latitude, coords.longitude);
  } catch (_) {
    // Best-effort — the next fix on the following interval retries.
  }
});
