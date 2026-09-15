/**
 * "We don't deliver here yet" must not depend on an authenticated POST.
 *
 * Observed on a real device standing 1177km outside every zone: the dashboard
 * rendered the full store-mode capsule instead of the out-of-area screen.
 * Persisted state read straight off the phone:
 *
 *   coords: {lat: 19.1651072, lng: 72.9985746}, source: "gps",
 *   insideZone: null, areaId: null, lastAreaId: 1
 *
 * areaId null proves GET /bootstrap answered deliverable: false correctly.
 * insideZone stayed null because it came ONLY from checkInsideZone's
 * POST /cart/calculate — authenticated and rate-limited, so a 401/429/dropped
 * connection produces no verdict. Every gate tests `insideZone === false`, so
 * null reads as allowed and the whole catalog opened up.
 *
 * Bootstrap's verdict now settles insideZone on the false side, and the GPS
 * branch no longer overwrites a known block with "unknown".
 */
jest.mock('../src/api', () => ({
  cartApi: { calculate: jest.fn() },
  bootstrapApi: { getBootstrap: jest.fn() },
  emitAreaChanged: jest.fn(),
}));
jest.mock('../src/components/Toast', () => ({ showToast: jest.fn() }));

const React = require('react');
const TestRenderer = require('react-test-renderer');
const Location = require('expo-location');
const { cartApi, bootstrapApi } = require('../src/api');
const { useDeliveryLocationStore } = require('../src/stores/useDeliveryLocationStore');
const {
  useDeliveryLocationSync,
  __setColdStartGpsAppliedForTests,
} = require('../src/hooks/useDeliveryLocationSync');

// The pin actually on the device, to 7dp.
const OUT_OF_AREA_FIX = { coords: { latitude: 19.1651072, longitude: 72.9985746, accuracy: 20 } };
const OUT_OF_AREA_BOOTSTRAP = {
  deliverable: false, area: null, zone: null, settings: null,
  storeModes: [], zoneGeometry: [], catalogVersion: null,
};

function Probe() {
  useDeliveryLocationSync();
  return null;
}

const mountSync = () => TestRenderer.act(async () => {
  TestRenderer.create(React.createElement(Probe));
});

describe('out-of-area gate survives a failed cart/calculate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __setColdStartGpsAppliedForTests(false);
    useDeliveryLocationStore.setState({
      coords: null, source: null, insideZone: null, zoneName: null, zoneId: null,
      areaId: null, lastAreaId: 1, areaName: null, brandColor: null, catalogVersion: null,
      recentLocations: [], isInitialSyncComplete: false,
    });
    Location.getForegroundPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true });
    Location.getCurrentPositionAsync.mockResolvedValue(OUT_OF_AREA_FIX);
  });

  it('blocks on bootstrap alone when the zone check 401s', async () => {
    bootstrapApi.getBootstrap.mockResolvedValue(OUT_OF_AREA_BOOTSTRAP);
    cartApi.calculate.mockRejectedValue(Object.assign(new Error('Unauthorized'), { status: 401 }));

    await mountSync();

    const state = useDeliveryLocationStore.getState();
    expect(state.coords).toEqual({ lat: 19.1651072, lng: 72.9985746 });
    expect(state.areaId).toBeNull();
    // The regression: this was null, and null reads as allowed everywhere.
    expect(state.insideZone).toBe(false);
  });

  it('still blocks when both checks agree the pin is outside', async () => {
    bootstrapApi.getBootstrap.mockResolvedValue(OUT_OF_AREA_BOOTSTRAP);
    cartApi.calculate.mockResolvedValue({ outOfRange: true, excluded: false, deliveryZone: null });

    await mountSync();

    expect(useDeliveryLocationStore.getState().insideZone).toBe(false);
  });

  it('does not invent a block when bootstrap itself fails', async () => {
    // Offline on a first launch: nothing is known, and "unknown" must stay
    // unknown — inventing false here would tell a customer standing inside a
    // zone that we do not deliver to them.
    bootstrapApi.getBootstrap.mockRejectedValue(new Error('Network request failed'));
    cartApi.calculate.mockRejectedValue(new Error('Network request failed'));

    await mountSync();

    expect(useDeliveryLocationStore.getState().insideZone).toBeNull();
  });

  it('lifts the block once a deliverable pin resolves', async () => {
    bootstrapApi.getBootstrap.mockResolvedValue(OUT_OF_AREA_BOOTSTRAP);
    cartApi.calculate.mockRejectedValue(new Error('offline'));
    await mountSync();
    expect(useDeliveryLocationStore.getState().insideZone).toBe(false);

    // Customer travels into area 2's zone; both checks now succeed.
    bootstrapApi.getBootstrap.mockResolvedValue({
      deliverable: true, area: { id: 2, name: 'Area 2' }, zone: { id: 9 },
      settings: null, storeModes: [], zoneGeometry: [], catalogVersion: 4,
    });
    cartApi.calculate.mockResolvedValue({
      outOfRange: false, excluded: false, deliveryZone: { id: 9, name: 'Zone B' },
    });
    Location.getCurrentPositionAsync.mockResolvedValue({
      coords: { latitude: 29.5152, longitude: 75.4548, accuracy: 20 },
    });

    await mountSync();

    const state = useDeliveryLocationStore.getState();
    expect(state.insideZone).toBe(true);
    expect(state.areaId).toBe(2);
    expect(state.zoneName).toBe('Zone B');
  });
});

describe('setAreaInfo', () => {
  beforeEach(() => {
    useDeliveryLocationStore.setState({
      insideZone: true, zoneName: 'Zone A', zoneId: 3,
      areaId: 1, lastAreaId: 1, areaName: 'Area 1', catalogVersion: 2,
    });
  });

  it('clears the zone along with the area when the pin is undeliverable', () => {
    useDeliveryLocationStore.getState().setAreaInfo({ deliverable: false });

    const state = useDeliveryLocationStore.getState();
    expect(state.insideZone).toBe(false);
    expect(state.zoneName).toBeNull();
    expect(state.zoneId).toBeNull();
    expect(state.areaId).toBeNull();
    // The cart's pricing baseline still has to survive the null interlude.
    expect(state.lastAreaId).toBe(1);
  });

  it('leaves insideZone alone on a deliverable pin — exclusion squares are checkInsideZone\'s call', () => {
    useDeliveryLocationStore.setState({ insideZone: false });
    useDeliveryLocationStore.getState().setAreaInfo({
      deliverable: true, areaId: 2, areaName: 'Area 2', catalogVersion: 5,
    });

    expect(useDeliveryLocationStore.getState().insideZone).toBe(false);
    expect(useDeliveryLocationStore.getState().areaId).toBe(2);
  });
});
