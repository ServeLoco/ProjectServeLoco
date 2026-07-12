import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useAuthStore } from '../stores';
import {
  connectAdminRealtime,
  disconnectAdminRealtime,
  emitAdminRealtimeForeground,
} from '../api/adminRealtimeClient';

// Mounted once in AdminNavigator (ADMIN TASK 7/9) — connects the admin socket
// whenever an admin session is live, disconnects on logout/deactivation.
function useAdminRealtime() {
  const hasHydrated = useAuthStore(state => state.hasHydrated);
  const admin = useAuthStore(state => state.admin);
  const adminToken = useAuthStore(state => state.adminToken);

  useEffect(() => {
    if (!hasHydrated) return undefined;

    if (admin && adminToken) {
      connectAdminRealtime(adminToken);
    } else {
      disconnectAdminRealtime();
    }

    return undefined;
  }, [hasHydrated, admin, adminToken]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') {
        emitAdminRealtimeForeground();
      }
    });

    return () => subscription.remove();
  }, []);
}

export { useAdminRealtime };
