import { useState, useEffect } from 'react';
import { storeModesApi } from '../api';

// Matches the two system rows that always exist server-side, so the capsule
// still renders correctly if the store-modes fetch fails (offline first load, etc).
const FALLBACK_MODES = [
  { id: 'packed', slug: 'packed', label: 'Packed Items', display_order: 1 },
  { id: 'fast_food', slug: 'fast_food', label: 'Fast Food', display_order: 2 },
];

export function useStoreModes() {
  const [modes, setModes] = useState(FALLBACK_MODES);

  useEffect(() => {
    let cancelled = false;
    storeModesApi.list()
      .then(res => {
        if (cancelled) return;
        const list = res?.data || res?.storeModes || [];
        if (Array.isArray(list) && list.length > 0) {
          setModes([...list].sort((a, b) => a.display_order - b.display_order));
        }
      })
      .catch(() => {
        // Keep fallback modes — the capsule stays usable offline.
      });
    return () => { cancelled = true; };
  }, []);

  return { modes };
}
