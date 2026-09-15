/**
 * Confirming a manual pin must resolve its AREA, not just its zone.
 *
 * Home's Change Location flow ("deliver to someone else") verified the pin
 * with POST /cart/calculate only. That call knows about zones and knows
 * nothing about areas, so after picking a pin in another area the store kept:
 *
 *   - the previous areaId (and lastAreaId), so the cross-area cart wipe
 *     compared the old area against itself and never fired — an area-1-priced
 *     cart walked into area 2's checkout
 *   - the previous area's settings (UPI id, support number) — real money
 *   - the previous area's socket room, so its admin broadcasts kept arriving
 *
 * while the catalog quietly followed the new pin (every catalog call carries
 * the pin, so the server resolved it per request). Observed on-device: pin
 * inside area 1's "gkp" zone, areaId null, lastAreaId 9.
 */
jest.mock('../src/api', () => ({
  cartApi: { calculate: jest.fn() },
  bootstrapApi: { getBootstrap: jest.fn() },
  emitAreaChanged: jest.fn(),
}));
jest.mock('../src/components/Toast', () => ({ showToast: jest.fn() }));

const fs = require('fs');
const path = require('path');
const { bootstrapApi, emitAreaChanged } = require('../src/api');
const { useDeliveryLocationStore } = require('../src/stores/useDeliveryLocationStore');
const { useCartStore } = require('../src/stores/useCartStore');
const { useSettingsStore } = require('../src/stores/useSettingsStore');
const { syncAreaInfo } = require('../src/hooks/useDeliveryLocationSync');

const AREA_9_BOOTSTRAP = {
  deliverable: true,
  area: { id: 9, name: 'Area Three', brandColor: '#123456' },
  zone: { id: 18, name: 'TEST Bhuna' },
  settings: { upi_id: 'area9@bank', support_phone: '9000000009' },
  storeModes: [{ slug: 'packed' }, { slug: 'fast_food' }],
  zoneGeometry: [],
  catalogVersion: 13,
};

describe('syncAreaInfo (the manual pin path now runs this too)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Standing in area 1 with a cart assembled there.
    useDeliveryLocationStore.setState({
      coords: { lat: 29.4479, lng: 75.6702 },
      source: 'manual', insideZone: true, zoneName: 'gkp', zoneId: 7,
      areaId: 1, lastAreaId: 1, areaName: 'Hisar', catalogVersion: 63,
    });
    useCartStore.setState({ items: [{ product: { id: 5, name: 'Amul Milk' }, quantity: 1 }] });
  });

  it('moves the store, the socket room and the cart when the pin lands in another area', async () => {
    bootstrapApi.getBootstrap.mockResolvedValue(AREA_9_BOOTSTRAP);

    await syncAreaInfo(29.5374, 75.7106);

    const state = useDeliveryLocationStore.getState();
    expect(state.areaId).toBe(9);
    expect(state.lastAreaId).toBe(9);
    expect(state.catalogVersion).toBe(13);
    expect(emitAreaChanged).toHaveBeenCalledWith(9);
    // An area-1-priced cart must never reach area 9's checkout.
    expect(useCartStore.getState().items).toEqual([]);
    // Area 9's own UPI — paying the wrong area's account is real money.
    expect(useSettingsStore.getState().upiId).toBe('area9@bank');
  });

  it('sends the stored area/zone/catalogVersion as If-None-Match', async () => {
    bootstrapApi.getBootstrap.mockResolvedValue(AREA_9_BOOTSTRAP);

    await syncAreaInfo(29.5374, 75.7106);

    expect(bootstrapApi.getBootstrap).toHaveBeenCalledWith(
      expect.objectContaining({ ifNoneMatch: '"1-7-63"' }),
    );
  });

  it('keeps the cart on a zone move inside the same area', async () => {
    bootstrapApi.getBootstrap.mockResolvedValue({
      ...AREA_9_BOOTSTRAP,
      area: { id: 1, name: 'Hisar' },
      zone: { id: 3, name: 'ok' },
      catalogVersion: 63,
    });

    await syncAreaInfo(29.45, 75.68);

    expect(useCartStore.getState().items).toHaveLength(1);
    expect(emitAreaChanged).not.toHaveBeenCalled();
  });

  it('clears the area when the pin is outside every zone', async () => {
    bootstrapApi.getBootstrap.mockResolvedValue({
      deliverable: false, area: null, zone: null, settings: null,
      storeModes: [], zoneGeometry: [], catalogVersion: null,
    });

    await syncAreaInfo(19.1651, 72.9986);

    const state = useDeliveryLocationStore.getState();
    expect(state.areaId).toBeNull();
    expect(state.insideZone).toBe(false);
    // The baseline the next area change is measured against must survive.
    expect(state.lastAreaId).toBe(1);
  });

  it('leaves everything alone when bootstrap fails', async () => {
    bootstrapApi.getBootstrap.mockRejectedValue(new Error('offline'));

    await expect(syncAreaInfo(29.5374, 75.7106)).resolves.toBeUndefined();

    expect(useDeliveryLocationStore.getState().areaId).toBe(1);
    expect(useCartStore.getState().items).toHaveLength(1);
  });
});

describe('HomeScreen wires the manual pin confirm to it', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'screens', 'customer', 'HomeScreen', 'HomeScreen.js'),
    'utf8',
  );

  it('calls syncAreaInfo after saving the picked pin', () => {
    expect(source).toMatch(/await syncAreaInfo\(lat, lng\);/);
  });

  it('resolves the area for an undeliverable pin too, not only a deliverable one', () => {
    // The call must sit OUTSIDE the `if (deliverable)` branch, otherwise a pin
    // dropped outside every zone leaves the previous area's id and settings in
    // place behind the out-of-zone screen.
    const confirmBody = source.slice(
      source.indexOf('const handleConfirmPickedLocation'),
      source.indexOf('const handleConfirmPickedLocation') + 2500,
    );
    const syncAt = confirmBody.indexOf('await syncAreaInfo(lat, lng);');
    const deliverableBranchAt = confirmBody.indexOf('if (deliverable) {');
    expect(syncAt).toBeGreaterThan(-1);
    expect(syncAt).toBeLessThan(deliverableBranchAt);
  });
});
