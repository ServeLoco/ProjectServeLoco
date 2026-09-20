/**
 * Tests for src/utils/crashReporting.js.
 *
 * The point of this module is that it works on the paths where nothing else
 * is watching — a throw inside the background FCM handler, the location task,
 * or a render error — so the things worth pinning are: the global handler is
 * installed and still chains to the previous one, a fatal is recorded BEFORE
 * the process-killing handler runs, nothing here ever throws, and no personal
 * data is attached to a report.
 */
// The module under test guards against double-init with module-scope state,
// so each test loads its own copy via jest.resetModules(). That also rebuilds
// the crashlytics mock, so `cl` must be re-read from the SAME fresh registry —
// a mock captured by a top-level import would belong to an older copy and
// never see these calls.
let cl;

function loadFresh() {
  jest.resetModules();
  cl = require('@react-native-firebase/crashlytics');
  return require('../src/utils/crashReporting');
}

describe('crashReporting', () => {
  let originalErrorUtils;

  beforeEach(() => {
    originalErrorUtils = global.ErrorUtils;
  });

  afterEach(() => {
    global.ErrorUtils = originalErrorUtils;
  });

  describe('initCrashReporting', () => {
    it('installs a global JS error handler', () => {
      const setGlobalHandler = jest.fn();
      global.ErrorUtils = { setGlobalHandler, getGlobalHandler: () => undefined };

      loadFresh().initCrashReporting();

      expect(setGlobalHandler).toHaveBeenCalledTimes(1);
    });

    it('only installs once, however many times it is called', () => {
      const setGlobalHandler = jest.fn();
      global.ErrorUtils = { setGlobalHandler, getGlobalHandler: () => undefined };

      const mod = loadFresh();
      mod.initCrashReporting();
      mod.initCrashReporting();
      mod.initCrashReporting();

      expect(setGlobalHandler).toHaveBeenCalledTimes(1);
    });

    it('turns collection off in development', () => {
      global.ErrorUtils = { setGlobalHandler: jest.fn(), getGlobalHandler: () => undefined };
      const prevDev = global.__DEV__;
      global.__DEV__ = true;

      loadFresh().initCrashReporting();

      expect(cl.setCrashlyticsCollectionEnabled).toHaveBeenCalledWith(cl.getCrashlytics(), false);
      global.__DEV__ = prevDev;
    });

    it('turns collection on in a release build', () => {
      global.ErrorUtils = { setGlobalHandler: jest.fn(), getGlobalHandler: () => undefined };
      const prevDev = global.__DEV__;
      global.__DEV__ = false;

      loadFresh().initCrashReporting();

      expect(cl.setCrashlyticsCollectionEnabled).toHaveBeenCalledWith(cl.getCrashlytics(), true);
      global.__DEV__ = prevDev;
    });

    it('survives a JS runtime with no ErrorUtils', () => {
      global.ErrorUtils = undefined;
      expect(() => loadFresh().initCrashReporting()).not.toThrow();
    });
  });

  describe('the installed handler', () => {
    let handler;
    let previous;

    beforeEach(() => {
      previous = jest.fn();
      let installed;
      global.ErrorUtils = {
        setGlobalHandler: (fn) => { installed = fn; },
        getGlobalHandler: () => previous,
      };
      loadFresh().initCrashReporting();
      handler = installed;
    });

    it('records a fatal error and then chains to the previous handler', () => {
      const order = [];
      cl.recordError.mockImplementation(() => order.push('record'));
      previous.mockImplementation(() => order.push('previous'));
      const err = new Error('boom');

      handler(err, true);

      expect(cl.recordError).toHaveBeenCalledWith(cl.getCrashlytics(), err, 'FatalJSError');
      // A fatal ends with the process being killed — anything queued after
      // the default handler would never be written.
      expect(order).toEqual(['record', 'previous']);
    });

    it('marks non-fatal errors differently so they can be told apart', () => {
      const err = new Error('minor');
      handler(err, false);
      expect(cl.recordError).toHaveBeenCalledWith(cl.getCrashlytics(), err, 'JSError');
    });

    it('wraps a thrown non-Error so it still reports', () => {
      handler('just a string', true);
      const [, reported] = cl.recordError.mock.calls[0];
      expect(reported).toBeInstanceOf(Error);
      expect(reported.message).toBe('just a string');
    });

    it('still chains when the native module throws', () => {
      cl.recordError.mockImplementation(() => { throw new Error('native gone'); });
      expect(() => handler(new Error('boom'), true)).not.toThrow();
      expect(previous).toHaveBeenCalled();
    });

    it('does not blow up when there is no previous handler', () => {
      let installed;
      global.ErrorUtils = {
        setGlobalHandler: (fn) => { installed = fn; },
        getGlobalHandler: () => undefined,
      };
      loadFresh().initCrashReporting();
      expect(() => installed(new Error('boom'), true)).not.toThrow();
    });
  });

  describe('recordHandledError', () => {
    it('reports under the name it is given', () => {
      const err = new Error('render blew up');
      loadFresh().recordHandledError(err, 'ReactRenderError');
      expect(cl.recordError).toHaveBeenCalledWith(cl.getCrashlytics(), err, 'ReactRenderError');
    });

    it('never throws when the native module is unavailable', () => {
      const mod = loadFresh();
      cl.recordError.mockImplementation(() => { throw new Error('no native module'); });
      expect(() => mod.recordHandledError(new Error('x'))).not.toThrow();
      expect(cl.recordError).toHaveBeenCalled();
    });
  });

  describe('logBreadcrumb', () => {
    it('forwards the message', () => {
      loadFresh().logBreadcrumb('opened products');
      expect(cl.log).toHaveBeenCalledWith(cl.getCrashlytics(), 'opened products');
    });

    it('ignores an empty breadcrumb', () => {
      loadFresh().logBreadcrumb('');
      expect(cl.log).not.toHaveBeenCalled();
    });
  });

  describe('user attribution', () => {
    it('sends the account id and role', () => {
      loadFresh().setCrashUser({ userId: 42, role: 'rider' });
      expect(cl.setUserId).toHaveBeenCalledWith(cl.getCrashlytics(), '42');
      expect(cl.setAttributes).toHaveBeenCalledWith(cl.getCrashlytics(), { role: 'rider' });
    });

    it('defaults an unlabelled account to customer', () => {
      loadFresh().setCrashUser({ userId: 7 });
      expect(cl.setAttributes).toHaveBeenCalledWith(cl.getCrashlytics(), { role: 'customer' });
    });

    it('sends NO personal data, whatever it is handed', () => {
      loadFresh().setCrashUser({
        userId: 42,
        role: 'rider',
        phone: '9999999999',
        name: 'Test Person',
        email: 'someone@example.com',
      });

      const forwarded = JSON.stringify([cl.setUserId.mock.calls, cl.setAttributes.mock.calls]);
      expect(forwarded).not.toContain('9999999999');
      expect(forwarded).not.toContain('Test Person');
      expect(forwarded).not.toContain('someone@example.com');
    });

    it('clears the account on sign-out', () => {
      loadFresh().clearCrashUser();
      expect(cl.setUserId).toHaveBeenCalledWith(cl.getCrashlytics(), '');
      expect(cl.setAttributes).toHaveBeenCalledWith(cl.getCrashlytics(), { role: 'signed-out' });
    });

    it('never throws when the native module is unavailable', () => {
      const mod = loadFresh();
      cl.setUserId.mockImplementation(() => { throw new Error('no native module'); });
      expect(() => mod.setCrashUser({ userId: 1 })).not.toThrow();
      expect(cl.setUserId).toHaveBeenCalled();
      expect(() => mod.clearCrashUser()).not.toThrow();
    });
  });

  /**
   * Context that makes a report actionable from another city: which screen,
   * which build, which endpoint failed. Crashlytics records the device itself
   * (model, Android version, RAM, uptime) on its own — these are the things
   * only our app knows.
   */
  describe('context for finding the crash', () => {
    it('sets custom keys as strings', () => {
      loadFresh().setCrashKeys({ appVersion: '1.9.1', areaId: 1, online: 'yes' });
      expect(cl.setAttributes).toHaveBeenCalledWith(cl.getCrashlytics(), {
        appVersion: '1.9.1',
        areaId: '1',
        online: 'yes',
      });
    });

    it('drops null and undefined keys rather than sending "null"', () => {
      loadFresh().setCrashKeys({ areaId: null, screen: undefined, role: 'shop' });
      expect(cl.setAttributes).toHaveBeenCalledWith(cl.getCrashlytics(), { role: 'shop' });
    });

    it('sends nothing at all when every key is empty', () => {
      loadFresh().setCrashKeys({ a: null, b: undefined });
      expect(cl.setAttributes).not.toHaveBeenCalled();
    });

    it('logs the screen as both a breadcrumb and a filterable key', () => {
      loadFresh().logScreen('ProductDetail');
      expect(cl.log).toHaveBeenCalledWith(cl.getCrashlytics(), 'Screen: ProductDetail');
      expect(cl.setAttributes).toHaveBeenCalledWith(cl.getCrashlytics(), { screen: 'ProductDetail' });
    });

    it('logs an API failure with method, path and status', () => {
      loadFresh().logApiFailure({ method: 'post', path: '/orders', status: 500, code: 'HTTP_ERROR' });
      expect(cl.log).toHaveBeenCalledWith(
        cl.getCrashlytics(),
        'API POST /orders -> 500 (HTTP_ERROR)'
      );
    });

    /**
     * Query strings carry addresses, phone numbers and tokens. None of that
     * belongs in a third-party dashboard.
     */
    it('strips the query string off a failed request path', () => {
      loadFresh().logApiFailure({
        method: 'GET',
        path: '/orders?phone=9999999999&token=secret',
        status: 404,
      });
      const [, message] = cl.log.mock.calls[0];
      expect(message).toBe('API GET /orders -> 404');
      expect(message).not.toContain('9999999999');
      expect(message).not.toContain('secret');
    });
  });

  describe('console capture', () => {
    let originalWarn;
    let originalError;

    beforeEach(() => {
      originalWarn = console.warn;
      originalError = console.error;
    });

    afterEach(() => {
      console.warn = originalWarn;
      console.error = originalError;
    });

    it('mirrors console.warn into the crash log and still prints it', () => {
      const mod = loadFresh();
      const printed = [];
      console.warn = (...a) => printed.push(a.join(' '));

      mod.installConsoleCapture();
      console.warn('something odd', 42);

      expect(cl.log).toHaveBeenCalledWith(cl.getCrashlytics(), '[warn] something odd 42');
      // The original console must still receive it — capture adds, never replaces.
      expect(printed).toEqual(['something odd 42']);
    });

    it('mirrors console.error and unwraps an Error to its message', () => {
      const mod = loadFresh();
      console.error = () => {};

      mod.installConsoleCapture();
      console.error(new Error('kaboom'));

      expect(cl.log).toHaveBeenCalledWith(cl.getCrashlytics(), '[error] kaboom');
    });

    it('only installs once, so messages are not logged twice', () => {
      const mod = loadFresh();
      console.warn = () => {};

      mod.installConsoleCapture();
      mod.installConsoleCapture();
      console.warn('once');

      expect(cl.log).toHaveBeenCalledTimes(1);
    });

    /**
     * If the reporter itself warns, the wrapper would call the reporter again,
     * which warns again — one bad log becomes an infinite loop that hangs the
     * app. The guard must break that.
     */
    it('does not recurse when the reporter itself logs', () => {
      const mod = loadFresh();
      console.warn = () => {};
      cl.log.mockImplementation(() => {
        console.warn('reporter is unhappy');
      });

      mod.installConsoleCapture();
      expect(() => console.warn('first')).not.toThrow();
      expect(cl.log.mock.calls.length).toBeLessThan(5);
    });

    it('caps a very long message instead of flooding the buffer', () => {
      const mod = loadFresh();
      console.warn = () => {};

      mod.installConsoleCapture();
      console.warn('x'.repeat(5000));

      const [, message] = cl.log.mock.calls[0];
      expect(message.length).toBeLessThan(600);
    });
  });
});
