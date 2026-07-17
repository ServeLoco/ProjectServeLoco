import { useState, useEffect, useCallback, useRef } from 'react';
import { storeModesApi } from '../api';

// Matches the two system rows that always exist server-side, so the capsule
// still renders correctly if the store-modes fetch fails (offline first load, etc).
const FALLBACK_MODES = [
  { id: 'packed', slug: 'packed', label: 'Packed Items', display_order: 1 },
  { id: 'fast_food', slug: 'fast_food', label: 'Fast Food', display_order: 2 },
];

export function useStoreModes() {
  const [modes, setModes] = useState(FALLBACK_MODES);
  const mountedRef = useRef(true);

  const refetch = useCallback(() => {
    return storeModesApi.list()
      .then(res => {
        if (!mountedRef.current) return;
        const list = res?.data || res?.storeModes || [];
        if (Array.isArray(list) && list.length > 0) {
          setModes([...list].sort((a, b) => a.display_order - b.display_order));
        }
      })
      .catch(() => {
        // Keep whatever modes are already loaded — the capsule stays usable offline.
      });
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    refetch();
    return () => { mountedRef.current = false; };
  }, [refetch]);

  return { modes, refetchModes: refetch };
}
