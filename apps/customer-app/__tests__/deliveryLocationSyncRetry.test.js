/**
 * A sync that produces no location verdict must not burn the foreground-resume
 * throttle.
 *
 * `lastSyncAt` was stamped on entry to syncDeliveryLocation and never revisited,
 * so a run that stored nothing — the 10s race timing out on a slow connection,
 * or the only available fix being too coarse to trust — still suppressed every
 * resume retry for MIN_REFRESH_INTERVAL_MS (5 minutes). That left a
 * first-launch customer (nothing persisted yet) with coords: null, which
 * CartScreen then sent to cart/calculate as a coordinate-less quote — and with
 * zone pricing on the server answers those with outOfRange: true. Net effect:
 * a customer standing inside a delivery zone was told "Outside delivery area"
 * in their cart, and could not shake it for five minutes.
 */
jest.mock('../src/api', () => ({
  cartApi: { calculate: jest.fn() },
  bootstrapApi: { getBootstrap: jest.fn() },
  emitAreaChanged: jest.fn(),
}));
jest.mock('../src/components/Toast', () => ({ showToast: jest.fn() }));

const React = require('react');
const TestRenderer = require('react-test-renderer');
const { AppState } = require('react-native');
const Location = require('expo-location');
const { cartApi, bootstrapApi } = require('../src/api');
const { useDeliveryLocationStore } = require('../src/stores/useDeliveryLocationStore');
const {
  useDeliveryLocationSync,
  __setColdStartGpsAppliedForTests,
} = require('../src/hooks/useDeliveryLocationSync');

const PRECISE_FIX = { coords: { latitude: 12.9, longitude: 77.6, accuracy: 20 } };
// Above MAX_TRUSTED_FIX_ACCURACY_M (1000m) — iOS with Precise Location off,
// or a network-derived fix indoors.
const COARSE_FIX = { coords: { latitude: 12.9, longitude: 77.6, accuracy: 1500 } };

function Probe() {
  useDeliveryLocationSync();
  return null;
}

/** Mounts the hook and returns the captured AppState 'change' handler. */
async function mountSync() {
  let handler;
  const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation((event, cb) => {
    if (event === 'change') handler = cb;
    return { remove: jest.fn() };
  });
  await TestRenderer.act(async () => {
    TestRenderer.create(React.createElement(Probe));
  });
  spy.mockRestore();
  return handler;
}

describe('an unresolved location sync does not suppress the next attempt', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Cold start, first-ever launch: nothing persisted to fall back on, which
    // is the population this bug could reach.
    __setColdStartGpsAppliedForTests(false);
    useDeliveryLocationStore.setState({
      coords: null, source: null, insideZone: null, zoneName: null, zoneId: null,
      areaId: null, areaName: null, brandColor: null, catalogVersion: null,
      recentLocations: [], isInitialSyncComplete: false,
    });
    Location.getForegroundPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true });
    bootstrapApi.getBootstrap.mockResolvedValue(null);
    cartApi.calculate.mockResolvedValue({
      outOfRange: false, excluded: false, deliveryZone: { id: 7, name: 'Zone A' }, items: [],
    });
  });

  it('CONTROL: a resolved sync still holds the throttle on resume', async () => {
    Location.getCurrentPositionAsync.mockResolvedValue(PRECISE_FIX);

    const onAppStateChange = await mountSync();
    expect(useDeliveryLocationStore.getState().coords).toEqual({ lat: 12.9, lng: 77.6 });
    expect(Location.getCurrentPositionAsync).toHaveBeenCalledTimes(1);

    await TestRenderer.act(async () => { onAppStateChange('active'); });

    // Nothing to retry — the location is known, so the resume is throttled.
    expect(Location.getCurrentPositionAsync).toHaveBeenCalledTimes(1);
  });

  it('retries on resume after a fix too coarse to place the customer', async () => {
    Location.getCurrentPositionAsync.mockResolvedValue(COARSE_FIX);

    const onAppStateChange = await mountSync();
    // The coarse fix is correctly refused, so no verdict was produced.
    expect(useDeliveryLocationStore.getState().coords).toBeNull();
    expect(Location.getCurrentPositionAsync).toHaveBeenCalledTimes(1);

    // A precise fix is available now (customer stepped outside, GPS warmed up).
    Location.getCurrentPositionAsync.mockResolvedValue(PRECISE_FIX);
    await TestRenderer.act(async () => { onAppStateChange('active'); });

    expect(Location.getCurrentPositionAsync).toHaveBeenCalledTimes(2);
    expect(useDeliveryLocationStore.getState().coords).toEqual({ lat: 12.9, lng: 77.6 });
    expect(useDeliveryLocationStore.getState().insideZone).toBe(true);
  });

  it('retries on resume after the zone check timed out on a slow connection', async () => {
    jest.useFakeTimers();
    Location.getCurrentPositionAsync.mockResolvedValue(PRECISE_FIX);
    cartApi.calculate.mockImplementation(() => new Promise(() => {})); // never settles
    bootstrapApi.getBootstrap.mockImplementation(() => new Promise(() => {}));

    let handler;
    const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation((event, cb) => {
      if (event === 'change') handler = cb;
      return { remove: jest.fn() };
    });
    await TestRenderer.act(async () => {
      TestRenderer.create(React.createElement(Probe));
    });
    spy.mockRestore();
    // Separate act: the mount effect's sync has to actually be in flight
    // before its 10s race timer can be advanced past.
    await TestRenderer.act(async () => {
      jest.advanceTimersByTime(11000); // past INITIAL_SYNC_TIMEOUT_MS
    });

    // Abandoned: the sync stored nothing, but told the app startup is done —
    // which is exactly the state Home treats as "allowed to shop".
    expect(useDeliveryLocationStore.getState().coords).toBeNull();
    expect(useDeliveryLocationStore.getState().isInitialSyncComplete).toBe(true);

    // Connection recovers; resuming must be allowed to try again immediately.
    cartApi.calculate.mockResolvedValue({
      outOfRange: false, excluded: false, deliveryZone: { id: 7, name: 'Zone A' }, items: [],
    });
    bootstrapApi.getBootstrap.mockResolvedValue(null);
    await TestRenderer.act(async () => { handler('active'); });

    expect(useDeliveryLocationStore.getState().coords).toEqual({ lat: 12.9, lng: 77.6 });
    jest.useRealTimers();
  });
});
