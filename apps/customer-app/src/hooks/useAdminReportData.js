import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { subscribeAdminOrderEvents, subscribeAdminRealtimeLifecycle } from '../api';

// One report resource: requests run only while focused, and a slow response
// from an older period/page can never replace the current report. With
// keepPreviousData, a new page/sort/shop keeps the last list on screen (with
// the loader) until the new one arrives instead of flashing empty.
export function useAdminReportData(load, { keepPreviousData = false } = {}) {
  const [state, setState] = useState({ data: null, loading: true, refreshing: false, error: false });
  const refreshRef = useRef(null);
  useFocusEffect(useCallback(() => {
    if (!load) {
      setState({ data: null, loading: false, refreshing: false, error: false });
      return undefined;
    }
    let active = true;
    let sequence = 0;
    let timer;
    const run = async (mode = 'silent') => {
      const requestId = ++sequence;
      setState(previous => ({
        ...previous,
        data: mode === 'reset' ? null : previous.data,
        loading: mode === 'reset' || mode === 'swap' || previous.data == null,
        refreshing: mode === 'refresh',
        error: false,
      }));
      try {
        const data = await load();
        if (active && requestId === sequence) {
          setState({ data, loading: false, refreshing: false, error: false });
        }
      } catch (_) {
        if (active && requestId === sequence) {
          setState(previous => ({ ...previous, loading: false, refreshing: false, error: true }));
        }
      }
    };
    refreshRef.current = run;
    run(keepPreviousData ? 'swap' : 'reset');
    const queueRefresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => run(), 300);
    };
    const unsubscribeOrders = subscribeAdminOrderEvents(queueRefresh);
    const unsubscribeLifecycle = subscribeAdminRealtimeLifecycle(({ eventName }) => {
      if (eventName === 'reconnected' || eventName === 'foreground') queueRefresh();
    });
    return () => {
      active = false;
      sequence += 1;
      clearTimeout(timer);
      refreshRef.current = null;
      unsubscribeOrders();
      unsubscribeLifecycle();
    };
  }, [load, keepPreviousData]));
  const refresh = useCallback(() => refreshRef.current?.('refresh'), []);
  return { ...state, refresh };
}
