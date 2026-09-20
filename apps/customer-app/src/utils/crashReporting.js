import {
  getCrashlytics,
  log as crashlyticsLog,
  recordError,
  setAttributes,
  setCrashlyticsCollectionEnabled,
  setUserId,
} from '@react-native-firebase/crashlytics';

/**
 * Crash reporting.
 *
 * Play Console only ever showed us the NATIVE stack — for a React Native app
 * that means frames like `ReactViewGroup.drawChild` with nothing about which
 * screen or which line of our own code was involved, and for a JS error just
 * `JavascriptException` with no stack at all. Crashlytics records the JS
 * error and its stack, plus the breadcrumbs leading up to it, so the next one
 * of these is a five-minute fix instead of a day of guessing.
 *
 * Everything here is best-effort and must never throw: a failure inside crash
 * reporting turning into a crash would be its own bug, and several of these
 * run on Android's headless JS relaunches where nothing above would catch it.
 */

let initialized = false;
let consoleCaptured = false;
let inConsoleCapture = false;

/** Cheap no-throw wrapper — the native module is absent in tests and on web. */
function safely(fn) {
  try {
    return fn(getCrashlytics());
  } catch (_) {
    return undefined;
  }
}

/**
 * Install the global JS error handler and set collection state.
 *
 * Called at module scope from index.js rather than inside a React effect, so
 * it also covers the background-only JS relaunches Android uses to deliver an
 * FCM message or a location fix — the exact contexts where a throw becomes a
 * crash with nobody watching.
 */
export function initCrashReporting() {
  if (initialized) return;
  initialized = true;

  // Never report from a developer's machine — it would mix local experiments
  // into the same dashboard we use to judge whether a release is healthy.
  safely((crashlytics) => setCrashlyticsCollectionEnabled(crashlytics, !__DEV__));

  installPromiseRejectionTracking();

  const errorUtils = global.ErrorUtils;
  if (!errorUtils || typeof errorUtils.setGlobalHandler !== 'function') return;

  const previousHandler = errorUtils.getGlobalHandler?.();
  errorUtils.setGlobalHandler((error, isFatal) => {
    // Record BEFORE delegating: the default handler ends a fatal by killing
    // the process, and anything queued after it would never be written.
    safely((crashlytics) => {
      crashlyticsLog(crashlytics, isFatal ? 'Fatal JS error' : 'Non-fatal JS error');
      recordError(
        crashlytics,
        error instanceof Error ? error : new Error(String(error)),
        isFatal ? 'FatalJSError' : 'JSError'
      );
    });
    if (typeof previousHandler === 'function') previousHandler(error, isFatal);
  });
}

/**
 * Make unhandled promise rejections visible in release builds.
 *
 * React Native only enables Hermes' rejection tracker under __DEV__ (see
 * Libraries/Core/polyfillPromise.js), where it feeds LogBox. In a release
 * build nothing is installed at all, so every `await` that rejects with no
 * catch — a failed order POST, a socket handler, a background task —
 * disappears with no warning and no report. They do not kill the process, but
 * they are how a screen ends up silently stuck, and they are invisible
 * exactly where we most need to see them.
 *
 * Only touched in release: overriding the dev tracker would take LogBox's
 * unhandled-rejection warnings away from whoever is working on the app.
 */
function installPromiseRejectionTracking() {
  if (__DEV__) return;
  const tracker = global.HermesInternal?.enablePromiseRejectionTracker;
  if (typeof tracker !== 'function') return;
  try {
    tracker({
      allRejections: true,
      onUnhandled: (id, rejection) => {
        recordHandledError(rejection, 'UnhandledPromiseRejection');
      },
      // Rejected then handled a tick later is normal and not worth a report.
      onHandled: () => {},
    });
  } catch (_) {
    // Older/!Hermes runtime — nothing to install.
  }
}

/**
 * Report an error we caught ourselves — a render error from the boundary, or
 * a failure in a path that deliberately swallows exceptions.
 *
 * @param {Error|unknown} error
 * @param {string} [name] groups these together in the Crashlytics dashboard
 */
export function recordHandledError(error, name = 'HandledError') {
  safely((crashlytics) =>
    recordError(crashlytics, error instanceof Error ? error : new Error(String(error)), name)
  );
}

/**
 * Leave a breadcrumb. Crashlytics attaches the most recent ones to whatever
 * crash comes next, which is how you find out what the user was doing.
 * Keep these coarse — a screen opened, an order accepted — not per-render.
 */
export function logBreadcrumb(message) {
  if (!message) return;
  safely((crashlytics) => crashlyticsLog(crashlytics, String(message)));
}

/**
 * Attach searchable context to every report from this device.
 *
 * Crashlytics already records the device itself — model, Android version,
 * RAM, disk, orientation, rooted or not, and how long the app had been open.
 * What it cannot know is anything about OUR app, and that is usually what
 * tells you which phone and which situation: which build, which screen, was
 * the phone online, which shop. Keys are filterable in the dashboard, so
 * "every crash on 1.9.1, offline, on the Products screen" is one query.
 *
 * Values must stay non-personal — see setCrashUser.
 */
export function setCrashKeys(keys) {
  if (!keys) return;
  const flat = {};
  Object.keys(keys).forEach((k) => {
    const v = keys[k];
    if (v === undefined || v === null) return;
    flat[k] = typeof v === 'string' ? v : String(v);
  });
  if (Object.keys(flat).length === 0) return;
  safely((crashlytics) => setAttributes(crashlytics, flat));
}

/**
 * Record which screen the user is on.
 *
 * This is the single most useful breadcrumb: a crash report that says
 * "Home -> Categories -> ProductList -> ProductDetail, then died" tells you
 * where to look immediately, and `screen` as a key lets you filter the
 * dashboard by it.
 */
export function logScreen(name) {
  if (!name) return;
  logBreadcrumb(`Screen: ${name}`);
  setCrashKeys({ screen: name });
}

/**
 * Record a failed API call.
 *
 * Deliberately method + path + status only. No query string, no request body,
 * no response body and no headers: those carry phone numbers, addresses and
 * auth tokens, and none of that belongs in a third-party dashboard. The
 * endpoint and the status code are enough to know what the app was doing.
 */
export function logApiFailure({ method, path, status, code } = {}) {
  const cleanPath = String(path || '').split('?')[0];
  const parts = [String(method || 'GET').toUpperCase(), cleanPath];
  if (status) parts.push(`-> ${status}`);
  if (code) parts.push(`(${code})`);
  logBreadcrumb(`API ${parts.join(' ')}`);
}

/**
 * Mirror console.warn/console.error into the crash report.
 *
 * Release builds have no logcat anyone can reach — the phone is in another
 * city. Every warning the app already prints is context we are currently
 * throwing away; Crashlytics keeps the recent ones and attaches them to
 * whatever crash comes next, which is how "why did it crash" gets answered
 * without the device in your hand.
 *
 * Only warn and error. Capturing console.log would flood the buffer and push
 * the useful lines out.
 */
export function installConsoleCapture() {
  if (consoleCaptured) return;
  consoleCaptured = true;

  ['warn', 'error'].forEach((level) => {
    const original = console[level];
    if (typeof original !== 'function') return;
    console[level] = (...args) => {
      // Re-entry guard: logBreadcrumb failing must never call back into the
      // console wrapper that is currently running, or one bad log becomes an
      // infinite loop that hangs the app.
      if (!inConsoleCapture) {
        inConsoleCapture = true;
        try {
          const text = args
            .map((a) => {
              if (a instanceof Error) return a.message;
              if (typeof a === 'string') return a;
              try {
                return JSON.stringify(a);
              } catch (_) {
                return String(a);
              }
            })
            .join(' ')
            .slice(0, 500);
          logBreadcrumb(`[${level}] ${text}`);
        } catch (_) {
          // Never let capture break logging.
        } finally {
          inConsoleCapture = false;
        }
      }
      original.apply(console, args);
    };
  });
}

/**
 * Tie crashes to an account so "one rider, ten events" is visible as a loop
 * rather than ten unrelated reports.
 *
 * Deliberately id and role ONLY. No phone number, name or address: this
 * leaves the device and we have no reason to put a customer's contact
 * details in a third-party dashboard to debug a draw-order exception.
 */
export function setCrashUser({ userId, role } = {}) {
  safely((crashlytics) => {
    setUserId(crashlytics, userId == null ? '' : String(userId));
    return setAttributes(crashlytics, { role: role || 'customer' });
  });
}

/** Forget the account on sign-out, so later crashes are not attributed to it. */
export function clearCrashUser() {
  safely((crashlytics) => {
    setUserId(crashlytics, '');
    return setAttributes(crashlytics, { role: 'signed-out' });
  });
}
