import { useEffect } from 'react';
import { AppState } from 'react-native';
import {
  connectCustomerRealtime,
  disconnectCustomerRealtime,
  emitRealtimeForeground,
} from '../api/realtimeClient';
import { useAuthStore } from '../stores';

function useCustomerRealtime() {
  const hasHydrated = useAuthStore(state => state.hasHydrated);
  const isAuthenticated = useAuthStore(state => state.isAuthenticated);
  const token = useAuthStore(state => state.token);

  useEffect(() => {
    if (!hasHydrated) return undefined;

    if (isAuthenticated && token) {
      connectCustomerRealtime(token);
    } else {
      disconnectCustomerRealtime();
    }

    return undefined;
  }, [hasHydrated, isAuthenticated, token]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') {
        emitRealtimeForeground();
      }
    });

    return () => subscription.remove();
  }, []);
}

export { useCustomerRealtime };
