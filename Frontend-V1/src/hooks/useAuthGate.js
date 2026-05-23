import { useNavigation } from '@react-navigation/native';
import { useAuthStore } from '../stores';

/**
 * useAuthGate
 * Intercepts protected actions. If unauthenticated, routes to the Auth screen.
 */
export function useAuthGate() {
  const isAuthenticated = useAuthStore(state => state.isAuthenticated);
  const setRedirectRoute = useAuthStore(state => state.setRedirectRoute);
  const navigation = useNavigation();

  const requireAuth = (intendedRoute = null, callback = null) => {
    if (isAuthenticated) {
      if (callback) callback();
      else if (intendedRoute) navigation.navigate(intendedRoute);
    } else {
      if (intendedRoute) {
        setRedirectRoute(intendedRoute);
      }
      // Open Auth as a modal
      navigation.navigate('Auth');
    }
  };

  return { requireAuth };
}

export default useAuthGate;
