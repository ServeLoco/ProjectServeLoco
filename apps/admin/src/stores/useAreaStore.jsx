import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { AreasApi } from '../api';
import { areaHeader } from './areaHeader';
import { useAuth } from '../components/AuthProvider';

const AreaContext = createContext();

// §2.10/§4.4 — the switcher lives once, in the shared layout, backed by this
// one store. Only a super_admin ever picks an area; an area_admin is always
// pinned to their own (areaHeader.get() already refuses to emit X-Area-Id
// for one regardless of anything here).
export const AreaProvider = ({ children }) => {
  const { user } = useAuth();
  const isSuperAdmin = user?.adminRole === 'super_admin';

  const [areas, setAreas] = useState([]);
  const [areaId, setAreaIdState] = useState(() => areaHeader.getPersisted());
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!user) {
      setInitialized(false);
      return;
    }

    if (!isSuperAdmin) {
      // area_admin: nothing to fetch or validate — they never pick.
      setAreas([]);
      setAreaIdState(null);
      setInitialized(true);
      return;
    }

    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const res = await AreasApi.list();
        if (!alive) return;
        const list = res.data || [];
        setAreas(list);

        // 25.6 — validate the persisted selection against the real list on
        // every boot. 'all' is always valid (it's not an area row); a
        // numeric id must still exist. A reload keeps the area the super
        // admin was on; a fresh login (AuthProvider resets the persisted
        // choice) or a no-longer-existing area opens on "All areas" — the
        // super admin's overview — never silently on the default area, and
        // never unset (most admin endpoints 400 with no area picked).
        const persisted = areaHeader.getPersisted();
        const persistedValid = persisted === 'all' || list.some((a) => String(a.id) === String(persisted));
        const finalAreaId = persistedValid ? persisted : 'all';

        areaHeader.setAreaId(finalAreaId);
        setAreaIdState(finalAreaId != null ? String(finalAreaId) : null);
      } catch (e) {
        console.error('[AreaProvider] failed to load areas:', e?.message || e);
      } finally {
        if (alive) {
          setLoading(false);
          setInitialized(true);
        }
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isSuperAdmin]);

  const setAreaId = useCallback((newAreaId) => {
    areaHeader.setAreaId(newAreaId);
    setAreaIdState(newAreaId != null ? String(newAreaId) : null);
  }, []);

  return (
    <AreaContext.Provider value={{ areas, areaId, setAreaId, loading, initialized, isSuperAdmin }}>
      {children}
    </AreaContext.Provider>
  );
};

export const useAreaStore = () => useContext(AreaContext);
