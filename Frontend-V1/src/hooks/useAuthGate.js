import { useCallback, useEffect, useRef } from 'react';
import { useNavigation } from '@react-navigation/native';
import { useAuthStore } from '../stores';

const AUTH_PREVIEW_MS = 10000;

/**
 * useAuthGate
 * Intercepts protected actions after the 10-second home preview.
 */
export function useAuthGate() {
  const isAuthenticated = useAuthStore(state => state.isAuthenticated);
  const previewStartedAt = useAuthStore(state => state.previewStartedAt);
  const setRedirectRoute = useAuthStore(state => state.setRedirectRoute);
  const navigation = useNavigation();
  const authTimerRef = useRef(null);

  useEffect(() => () => {
    if (authTimerRef.current) {
      clearTimeout(authTimerRef.current);
    }
  }, []);

  const openAuth = useCallback((intendedRoute) => {
    if (intendedRoute) {
      setRedirectRoute(intendedRoute);
    }
    navigation.navigate('Auth');
  }, [navigation, setRedirectRoute]);

  const requireAuth = useCallback((intendedRoute = null, callback = null) => {
    if (isAuthenticated) {
      if (callback) callback();
      else if (intendedRoute) navigation.navigate(intendedRoute);
      return true;
    }

    const elapsed = Date.now() - (previewStartedAt || Date.now());
    const remainingPreviewMs = Math.max(AUTH_PREVIEW_MS - elapsed, 0);

    if (remainingPreviewMs === 0) {
      openAuth(intendedRoute);
      return false;
    }

    if (authTimerRef.current) {
      clearTimeout(authTimerRef.current);
    }

    if (intendedRoute) {
      setRedirectRoute(intendedRoute);
    }

    authTimerRef.current = setTimeout(() => {
      navigation.navigate('Auth');
    }, remainingPreviewMs);

    return false;
  }, [isAuthenticated, navigation, openAuth, previewStartedAt, setRedirectRoute]);

  return { requireAuth };
}

export default useAuthGate;
