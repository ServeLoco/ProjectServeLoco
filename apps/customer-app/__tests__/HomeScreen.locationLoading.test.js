const fs = require('fs');
const path = require('path');

const homeSource = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'screens', 'customer', 'HomeScreen', 'HomeScreen.js'),
  'utf8',
);
const storeSource = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'stores', 'useDeliveryLocationStore.js'),
  'utf8',
);
const syncSource = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'hooks', 'useDeliveryLocationSync.js'),
  'utf8',
);

describe('Home location initialization loading', () => {
  it('keeps the existing shimmer visible until initial location resolution finishes', () => {
    expect(storeSource).toMatch(/isInitialSyncComplete: false/);
    expect(storeSource).toMatch(/markInitialSyncComplete/);
    expect(syncSource).toMatch(/finally \{[\s\S]*markInitialSyncComplete\(\);/);
    expect(homeSource).toMatch(/state => state\.isInitialSyncComplete/);
    // Cold start still gates on the location sync; a post-first-load fetch
    // (mode switch, area change) now skeletons only the sections block.
    expect(homeSource).toMatch(/const isHomeLoading = \(isLoading && !hasLoadedOnce\) \|\| !isInitialLocationSyncComplete;/);
    expect(homeSource).toMatch(/const isSectionsLoading = isLoading && hasLoadedOnce;/);
  });

  it('shows a slow-internet message without leaving the customer blocked indefinitely', () => {
    expect(homeSource).toMatch(/Slow internet — setting your delivery location…/);
    expect(syncSource).toMatch(/INITIAL_SYNC_TIMEOUT_MS/);
  });

  // A pinless request makes the server fall back through users.last_area_id
  // to the DEFAULT area. A customer who has never ordered has neither, so a
  // fresh signup in area 2 was served area 1's sections/settings/UPI and saw
  // them the moment the shimmer lifted. Gated on a boolean, never on the
  // coords object — that changes identity on nearly every GPS fix.
  it('never fires a dashboard/bootstrap load without a resolved pin', () => {
    expect(homeSource).toMatch(/const hasDeliveryPin = Boolean\(deliveryCoords\);/);
    expect(homeSource).toMatch(/if \(!hasDeliveryPin\) return undefined;/);
    expect(homeSource).toMatch(/\}, \[loadHomeData, hasDeliveryPin\]\);/);
  });

  // Permission granted but no usable fix (GPS timeout, or an iOS reduced
  // accuracy fix rejected as too coarse) used to fall through to the
  // dashboard, which then fetched with no pin and was answered from another
  // area. It must land on a card with a retry instead.
  it('gates the catalog when the sync completes without a usable fix', () => {
    expect(homeSource).toMatch(/const locationUnresolved = !hasDeliveryPin && isInitialLocationSyncComplete/);
    expect(homeSource).toMatch(/const isLocationGated = needsLocationPermission \|\| locationUnresolved/);
    expect(homeSource).toMatch(/\) : locationUnresolved \? \(/);
    expect(homeSource).toMatch(/Couldn't pin your location/);
  });

  // Retaining another area's sections here is worse than having none:
  // loadHomeData skips the skeleton when the cache has an entry and repaints
  // the stale one while the correct fetch is still in flight.
  it('drops cached sections on the first area/zone resolve, not only on later ones', () => {
    expect(homeSource).not.toMatch(/hadResolvedLocation/);
  });
});

// Per-area values (UPI target, support contact, night charge — §27.5) are
// persisted, so a launch in a different area hydrates the previous area's.
// The freshness stamp persisting alongside them made isStale() report fresh
// and suppress the very refetch that corrects them.
describe('Settings store area safety', () => {
  const settingsSource = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'stores', 'useSettingsStore.js'),
    'utf8',
  );

  it('does not persist the settings freshness stamp across launches', () => {
    expect(settingsSource).toMatch(/partialize: \(\{ _lastFetched, \.\.\.rest \}\) => rest,/);
  });
});
