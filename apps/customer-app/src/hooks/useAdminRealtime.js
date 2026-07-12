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

    // Cleanup must disconnect: on logout the store change swaps RootNavigator
    // to the customer shell and unmounts AdminNavigator (and this hook) before
    // the `else` branch above ever runs with the cleared state — without this,
    // the admin socket would stay connected on a 12h-valid token after logout
    // (QA case 13 "no admin socket leak").
    return () => disconnectAdminRealtime();
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
