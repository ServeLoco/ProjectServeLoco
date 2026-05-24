import { useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import { useAuthStore } from '../stores';

/**
 * useAuthGate
 * Verifies if user is authenticated.
 */
export function useAuthGate() {
  const isAuthenticated = useAuthStore(state => state.isAuthenticated);
  const navigation = useNavigation();

  const requireAuth = useCallback((intendedRoute = null, callback = null) => {
    if (isAuthenticated) {
      if (callback) callback();
      else if (intendedRoute) navigation.navigate(intendedRoute);
      return true;
    }

    navigation.navigate('Auth');
    return false;
  }, [isAuthenticated, navigation]);

  return { requireAuth };
}

export default useAuthGate;
