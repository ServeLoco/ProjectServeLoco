import { useEffect } from 'react';
import { create } from 'zustand';
import { productsApi } from '../api/productsApi';
import { useDeliveryLocationStore } from './useDeliveryLocationStore';

// The rating each product card shows, for the customer's area, from
// GET /products/ratings (the API owns the formula: unrated orders count as
// 5 stars, never below 3.5, `fire` above 4.8). One fetch serves every card.

// Ratings move slowly: refetch at most every 10 minutes for the same area.
const FRESH_MS = 10 * 60 * 1000;
// After a failed fetch, wait a minute before the next card tries again.
const RETRY_MS = 60 * 1000;

// A product nobody has received yet starts at 5 stars — and 5 is above the
// 4.8 fire line, so it burns too.
export const DEFAULT_PRODUCT_RATING = Object.freeze({ rating: 5, fire: true });

const ratingKey = (itemType, id) => `${itemType === 'combo' ? 'combo' : 'product'}:${id}`;

// Which area the ratings belong to: the resolved area, else the pin.
const scopeOf = ({ coords, areaId }) => {
  if (!coords) return null;
  return areaId != null ? `area:${areaId}` : `pin:${coords.lat},${coords.lng}`;
};

export const useProductRatingsStore = create((set, get) => ({
  byKey: {}, // 'product:12' -> { rating: 4.6, fire: false }
  loadedFor: null,
  nextLoadAt: 0,
  loading: false,

  ensureLoaded: async () => {
    const location = useDeliveryLocationStore.getState();
    const scope = scopeOf(location);
    // No pin yet: nothing to scope the ratings to.
    if (!scope) return;
    const state = get();
    if (state.loading) return;
    if (state.loadedFor === scope && Date.now() < state.nextLoadAt) return;

    set({ loading: true });
    try {
      const res = await productsApi.getRatings({
        latitude: location.coords.lat,
        longitude: location.coords.lng,
      });
      const byKey = {};
      (res?.data?.items || []).forEach((it) => {
        const rating = Number(it.rating);
        if (!Number.isFinite(rating)) return;
        byKey[ratingKey(it.itemType ?? it.item_type, it.productId ?? it.product_id)] = {
          rating,
          fire: Boolean(it.fire),
        };
      });
      set({ byKey, loadedFor: scope, nextLoadAt: Date.now() + FRESH_MS, loading: false });
    } catch {
      set({ loadedFor: scope, nextLoadAt: Date.now() + RETRY_MS, loading: false });
    }
    // The pin moved to another area while this was loading (that change's
    // own call returned early above): load the new area now.
    const nowScope = scopeOf(useDeliveryLocationStore.getState());
    if (nowScope && nowScope !== scope) get().ensureLoaded();
  },
}));

/**
 * `{ rating, fire }` for one product (or combo); DEFAULT_PRODUCT_RATING when
 * it has no delivered order yet. Loads the area's ratings on first use and
 * again when the delivery area changes.
 */
export function useProductRating(id, itemType = 'product') {
  const key = id == null ? null : ratingKey(itemType, id);
  const entry = useProductRatingsStore((s) => (key ? s.byKey[key] : undefined));
  const areaId = useDeliveryLocationStore((s) => s.areaId);
  useEffect(() => {
    useProductRatingsStore.getState().ensureLoaded();
  }, [areaId]);
  return entry ?? DEFAULT_PRODUCT_RATING;
}
