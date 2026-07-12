import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import CustomerNavigator from './CustomerNavigator';
import ShopOwnerNavigator from './ShopOwnerNavigator';
import RiderNavigator from './RiderNavigator';
import AdminNavigator from './AdminNavigator';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { OfflineBanner } from '../components';
import { trackScreen, initAnalytics, stopAnalytics } from '../api/analyticsClient';
import { useAuthStore } from '../stores';
import { colors, spacing, typography } from '../theme';

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
 * Shown while a known mobile admin waits for their admin JWT to mint
 * (right after OTP, or after a transient mint failure). Keeps the plan's
 * D1 promise — an admin phone never sees the customer home — and gives a
 * retry path instead of stranding the admin if the first mint failed on
 * a network blip (mintAdminSession only clears `admin` on 401/403).
 */
function AdminMintGate() {
  const mintAdminSession = useAuthStore((s) => s.mintAdminSession);
  const [busy, setBusy] = useState(true);
  const [failed, setFailed] = useState(false);

  const attempt = async () => {
    setBusy(true);
    setFailed(false);
    const token = await mintAdminSession();
    // On success/definitive-rejection the store change re-renders
    // RootNavigator past this gate; only a transient failure lands here.
    if (!token) {
      setBusy(false);
      setFailed(true);
    }
  };

  useEffect(() => {
    // setSession/validateSession already fired a mint; this catches the case
    // where that one lost a race with a dead network at cold start.
    attempt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={gateStyles.container}>
      {busy ? (
        <>
          <ActivityIndicator color={colors.saffron} size="large" />
          <Text style={gateStyles.text}>Opening Admin Mode…</Text>
        </>
      ) : failed ? (
        <>
          <Text style={gateStyles.title}>Couldn't reach the server</Text>
          <Text style={gateStyles.text}>Check your connection, then try again.</Text>
          <TouchableOpacity style={gateStyles.retryBtn} onPress={attempt} activeOpacity={0.85}>
            <Text style={gateStyles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </>
      ) : null}
    </View>
  );
}

const gateStyles = StyleSheet.create({
  container: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.bgApp, padding: spacing.xl, gap: spacing.sm,
  },
  title: { ...typography.h3, color: colors.textPrimary },
  text: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  retryBtn: {
    marginTop: spacing.md, backgroundColor: colors.saffron, borderRadius: 12,
    paddingHorizontal: spacing.xl, paddingVertical: spacing.sm,
  },
  retryBtnText: { color: colors.textInverse, fontWeight: '800' },
});

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
            after login (see plans/admin-mode-mobile.md §7.1). While the
            admin JWT is still minting (admin set, adminToken not yet),
            AdminMintGate holds the screen instead of flashing customer
            home. Unauthenticated login still runs inside CustomerNavigator. */}
        {isAuthenticated && admin && adminToken
          ? <AdminNavigator />
          : isAuthenticated && admin
            ? <AdminMintGate />
            : isAuthenticated && shop
              ? <ShopOwnerNavigator />
              : isAuthenticated && rider
                ? <RiderNavigator />
                : <CustomerNavigator />}
      </NavigationContainer>
    </>
  );
}
