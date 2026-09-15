import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

const RECENT_LOCATION_LIMIT = 1;

// Single source of truth for "where do we deliver to" — read by Cart/Checkout
// for pricing and by Home for the outside-zone banner.
//
// source: 'gps' — background best-effort fix (useDeliveryLocationSync),
//   safe to overwrite on the next fix.
// source: 'manual' — the customer explicitly dropped a pin (Home's Change
//   Location flow) because GPS fell outside every delivery zone; this wins
//   over GPS and persists until the customer changes it again.
export const useDeliveryLocationStore = create(
  persist(
    (set, get) => ({
      coords: null, // { lat, lng } | null
      source: null, // 'gps' | 'manual' | null
      insideZone: null, // true | false | null (unknown / not yet checked)
      zoneName: null, // admin-assigned delivery zone name for the current coords, or null
      // Matched zone's id. Travels with zoneName but is the stable key —
      // anything that has to react to "the customer moved to a different
      // zone" (cache scoping, cart revalidation) must compare ids, since
      // names are editable in admin and two zones can share one.
      zoneId: null,
      // TASK 28.2 — the pin's resolved area, from GET /bootstrap. null when
      // never resolved yet, or when the pin fell outside every zone (§2.4 —
      // "we don't deliver here", never a lingering stale area).
      areaId: null,
      // The last area the customer was actually IN. `areaId` above goes null
      // the moment a pin leaves every zone (§2.4), which destroys the only
      // baseline "did the area change" has to compare against — see
      // applyBootstrapResult. Persisted, because the cart it guards is
      // persisted too: a launch that starts out of zone must still know which
      // area the saved cart was priced under. Only ever overwritten by
      // another real area, never cleared.
      lastAreaId: null,
      areaName: null,
      brandColor: null,
      // area.catalog_version at the last successful (non-304) bootstrap
      // fetch — sent back as the source for If-None-Match on the next one.
      catalogVersion: null,
      recentLocations: [], // [{ lat, lng, label }] manually chosen locations
      // Runtime-only startup gate. It must not persist: every fresh launch
      // waits for the current location check before Home reveals products.
      isInitialSyncComplete: false,

      // force=true bypasses the manual-pin-wins rule. Only useDeliveryLocationSync
      // passes it, for the first live fix of a cold start — see coldStartGpsApplied.
      setGpsLocation: (lat, lng, insideZone, zoneName = null, zoneId = null, { force = false } = {}) => {
        if (get().source === 'manual' && !force) return; // manual pin wins until explicitly changed
        set({ coords: { lat, lng }, source: 'gps', insideZone, zoneName, zoneId });
      },

      setManualLocation: (lat, lng, insideZone = true, zoneName = null, zoneId = null) => {
        const previous = get().recentLocations || [];
        const existing = previous.find((location) => location.lat === lat && location.lng === lng);
        const nextLocation = { lat, lng, label: existing?.label || null };
        set({
          coords: { lat, lng },
          source: 'manual',
          insideZone,
          zoneName,
          zoneId,
          recentLocations: [nextLocation, ...previous.filter((location) => (
            location.lat !== lat || location.lng !== lng
          ))].slice(0, RECENT_LOCATION_LIMIT),
        });
      },

      setLocationLabel: (label) => {
        const { coords, recentLocations } = get();
        if (!coords || !label) return;
        set({
          recentLocations: (recentLocations || []).map((location) => (
            location.lat === coords.lat && location.lng === coords.lng
              ? { ...location, label }
              : location
          )),
        });
      },

      setInsideZone: (insideZone) => set({ insideZone }),

      // TASK 28.2 — result of a bootstrap fetch for the pin currently in
      // `coords`. deliverable: false (pin outside every zone) clears the
      // area rather than leaving a stale one in place (§2.4). A 304 (no
      // change) is never routed here — the caller just keeps what's set.
      // The out-of-zone branch deliberately omits lastAreaId — `set` merges,
      // so the baseline survives the null interlude (see the field above).
      //
      // deliverable: false ALSO settles insideZone. Every "we don't deliver
      // here yet" gate keys off insideZone === false, and that verdict used
      // to come only from checkInsideZone's POST /cart/calculate — an
      // authenticated, rate-limited call. Any failure of it (401 on an
      // expired token, a 429, a dropped connection) left insideZone null,
      // which every gate reads as "allowed", so a pin 1177km outside every
      // zone showed the full dashboard (verified on-device: coords in
      // Mumbai, areaId null, insideZone null, store-mode capsule rendering).
      // GET /bootstrap is public, unauthenticated, and answered the same
      // question correctly on that very request — deliverable: false IS
      // "the pin matched no zone in any area", so stop throwing it away.
      // Only the false direction: deliverable: true says nothing about
      // exclusion squares, which only checkInsideZone knows about.
      setAreaInfo: ({ deliverable, areaId, areaName, brandColor, catalogVersion }) => set(
        deliverable
          ? { areaId, areaName, brandColor, catalogVersion, lastAreaId: areaId ?? get().lastAreaId }
          : {
            areaId: null, areaName: null, brandColor: null, catalogVersion: null,
            insideZone: false, zoneName: null, zoneId: null,
          },
      ),

      // GPS permission revoked (device Settings) after a prior fix already
      // persisted coords/insideZone — a stale gps-sourced fix left in place
      // reads as "known out of zone" instead of "no coords", so restart shows
      // the out-of-zone EmptyState instead of the Allow Location card. A
      // manual pin has nothing to do with foreground GPS permission and must
      // survive this.
      clearGpsLocation: () => {
        if (get().source === 'manual') return;
        set({
          coords: null, source: null, insideZone: null, zoneName: null, zoneId: null,
          areaId: null, areaName: null, brandColor: null, catalogVersion: null,
        });
      },

      // Name and id are always resolved from the same match, so they are set
      // together — a zoneName without its id would leave the stale id behind
      // and make the "did the zone change" comparison lie.
      setZone: (zoneName, zoneId = null) => set({ zoneName, zoneId }),

      markInitialSyncComplete: () => set({ isInitialSyncComplete: true }),

      clearManualLocation: () => set({
        coords: null, source: null, insideZone: null, zoneName: null, zoneId: null,
        areaId: null, areaName: null, brandColor: null, catalogVersion: null,
      }),
    }),
    {
      name: 'serveloco-delivery-location',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({
        coords, source, insideZone, zoneName, zoneId, recentLocations,
        areaId, lastAreaId, areaName, brandColor, catalogVersion,
      }) => ({
        coords, source, insideZone, zoneName, zoneId, recentLocations,
        areaId, lastAreaId, areaName, brandColor, catalogVersion,
      }),
      // Devices that persisted a longer history under the old
      // RECENT_LOCATION_LIMIT still have extra entries sitting in
      // AsyncStorage — trim them on load so the cap takes effect
      // immediately instead of waiting for the next manual pin.
      merge: (persisted, current) => ({
        ...current,
        ...persisted,
        recentLocations: (persisted?.recentLocations || []).slice(0, RECENT_LOCATION_LIMIT),
      }),
    },
  ),
);

export default useDeliveryLocationStore;
