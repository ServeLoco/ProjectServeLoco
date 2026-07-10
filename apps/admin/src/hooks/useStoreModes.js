import { useState, useEffect } from 'react';
import { StoreModesApi } from '../api';
import { readList } from '../utils/apiResponse';

// Fallback keeps pages functional if the store-modes endpoint is briefly
// unreachable — matches the two hardcoded modes that always exist as system rows.
const FALLBACK_MODES = [
  { id: 'packed', slug: 'packed', label: 'Packed Items', display_order: 1 },
  { id: 'fast_food', slug: 'fast_food', label: 'Fast Food', display_order: 2 },
];

export function useStoreModes() {
  const [modes, setModes] = useState(FALLBACK_MODES);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    StoreModesApi.list()
      .then(res => {
        if (cancelled) return;
        const list = readList(res, ['storeModes']);
        if (list.length > 0) {
          setModes([...list].sort((a, b) => a.display_order - b.display_order));
        }
      })
      .catch(err => console.error('Failed to load store modes:', err))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return { modes, loading };
}

export const modeLabel = (modes, slug) => modes.find(m => m.slug === slug)?.label || slug;
