import { useState, useEffect } from 'react';
import { storeModesApi } from '../api/storeModesApi';

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
        // Keep fallback modes.
      });
    return () => { cancelled = true; };
  }, []);

  return { modes };
}
