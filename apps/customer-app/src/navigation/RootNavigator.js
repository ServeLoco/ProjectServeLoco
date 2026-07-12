import React, { useEffect } from 'react';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import CustomerNavigator from './CustomerNavigator';
import ShopOwnerNavigator from './ShopOwnerNavigator';
import RiderNavigator from './RiderNavigator';
import AdminNavigator from './AdminNavigator';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { OfflineBanner } from '../components';
import { trackScreen, initAnalytics, stopAnalytics } from '../api/analyticsClient';
import { useAuthStore } from '../stores';

/**
 * Shared navigation ref — used by useLocalNotifications to navigate
 * when the user taps a phone notification.
 */
export const navigationRef = createNavigationContainerRef();

// Map React Navigation route names to the analytics screen whitelist.
const SCREEN_NAME_MAP = {
  Home: 'Home',
  Categories: 'Categories',
  ProductList: 'ProductList',
  ProductDetail: 'ProductDetail',
  Cart: 'Cart',
  Checkout: 'Checkout',
  Orders: 'Orders',
  Search: 'Search',
  Profile: 'Profile',
};

function getActiveScreenName(state) {
  if (!state) return null;
  let route = state.routes[state.index];
  while (route?.state?.routes) {
    route = route.state.routes[route.state.index];
  }
  return route?.name ? (SCREEN_NAME_MAP[route.name] || route.name) : null;
}

/**
 * RootNavigator
 * Customer app shell. Management tools live in the separate web project.
 */
export default function RootNavigator() {
  const { isReachable, isDeviceOffline } = useNetworkStatus();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const shop = useAuthStore((s) => s.shop);
  const rider = useAuthStore((s) => s.rider);
  const admin = useAuthStore((s) => s.admin);
  const adminToken = useAuthStore((s) => s.adminToken);
  const showOffline = !isReachable;
  const message = isDeviceOffline
    ? 'You appear to be offline.'
    : "Can't reach the server. Retrying…";

  // Init analytics batching (AppState listener) on mount; clean up on unmount.
  useEffect(() => {
    initAnalytics();
    return () => stopAnalytics();
  }, []);

  return (
    <>
      <OfflineBanner visible={showOffline} message={message} />
      <NavigationContainer
        ref={navigationRef}
        onStateChange={(state) => {
          const screen = getActiveScreenName(state);
          if (screen) trackScreen(screen);
        }}
      >
        {/* Role shells (D2: admin/shop/rider are mutually exclusive).
            Admin checked first — an active mobile admin phone never sees
            the customer home, even if role data is still settling right
            after login (see plans/admin-mode-mobile.md §7.1).
            Unauthenticated login still runs inside CustomerNavigator. */}
        {isAuthenticated && admin && adminToken
          ? <AdminNavigator />
          : isAuthenticated && shop
            ? <ShopOwnerNavigator />
            : isAuthenticated && rider
              ? <RiderNavigator />
              : <CustomerNavigator />}
      </NavigationContainer>
    </>
  );
}
