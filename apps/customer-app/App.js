import React, { useEffect, useState } from 'react';
import { AppState, StatusBar, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator, navigationRef } from './src/navigation';
import { colors } from './src/theme';
import { setCustomerTokenProvider, settingsApi } from './src/api';
import { setCustomerLogoutHandler } from './src/api/httpClient';
import { useCustomerRealtime, useLocalNotifications, useNetworkStatus } from './src/hooks';
import { useAuthStore } from './src/stores';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { OfflineBanner } from './src/components/OfflineBanner';
import { ToastProvider } from './src/components/Toast';
import { ForceUpdateModal } from './src/components/ForceUpdateModal';
import appJson from './app.json';

/**
 * Compares two semver strings (e.g. "1.2.0" vs "1.1.0").
 * Returns true when `current` is strictly less than `required`.
 */
function isUpdateRequired(current, required) {
  if (!required) return false;
  const toNum = (v) =>
    String(v)
      .split('.')
      .map((n) => parseInt(n, 10) || 0);
  const [ma1, mi1, pa1] = toNum(current);
  const [ma2, mi2, pa2] = toNum(required);
  if (ma1 !== ma2) return ma1 < ma2;
  if (mi1 !== mi2) return mi1 < mi2;
  return pa1 < pa2;
}

function App() {
  useCustomerRealtime();
  useLocalNotifications(navigationRef);
  const { isOnline } = useNetworkStatus();

  // Force-update gate: check server's minimum_version against installed version
  const [forceUpdate, setForceUpdate] = useState(false);
  useEffect(() => {
    let cancelled = false;
    settingsApi.getSettings().then((res) => {
      if (cancelled) return;
      const minimumVersion = res?.data?.minimum_version ?? null;
      const installedVersion = appJson?.expo?.version ?? '0.0.0';
      if (isUpdateRequired(installedVersion, minimumVersion)) {
        setForceUpdate(true);
      }
    }).catch(() => {
      // Network unavailable at launch — don't block the user; they can update
      // once connectivity is restored and they reopen the app.
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    // Hand the http client a callback so any 401 it sees can wipe the
    // session; CustomerNavigator then re-renders the Auth screen because
    // isAuthenticated flips back to false.
    setCustomerLogoutHandler(() => {
      useAuthStore.getState().logout();
    });

    // Tell the http client how to read the current customer token so it can
    // attach the Authorization header on { auth: 'customer' } requests.
    // Without this, every authenticated call goes out tokenless -> 401 ->
    // the logout handler above fires and bounces the user to Auth.
    setCustomerTokenProvider(() => useAuthStore.getState().token);

    // Clear the image memory cache when the app comes back to the
    // foreground after being backgrounded for a while. expo-image's
    // disk cache persists across launches, so we only need to clear
    // RAM — the next image will re-decode from disk on demand.
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        try { ExpoImage.clearMemoryCache(); } catch (_) { /* ignore */ }
      }
    });
    return () => sub.remove();
  }, []);

  // Startup session check. Uses the persist middleware's onFinishHydration
  // hook (zustand v5) so we wait for rehydration to complete via a real
  // event instead of polling hasHydrated every 50ms for up to 1s — slow
  // Android devices could time out and force a spurious logout.
  useEffect(() => {
    let cancelled = false;
    const unsubFinish = useAuthStore.persist.onFinishHydration(() => {
      if (cancelled) return;
      useAuthStore.getState().validateSession();
    });
    return () => {
      cancelled = true;
      unsubFinish();
    };
  }, []);

  // Foreground re-validation. When the user reopens the app after a long
  // background, re-validate the session so we catch a freshly-expired
  // token before the first focus-driven fetch fires a 401 and kicks the
  // user out mid-screen.
  useEffect(() => {
    // Skip the first 'active' event (it's the cold-start one; startup
    // validateSession above already ran).
    const skipFirst = { value: true };
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      if (skipFirst.value) {
        skipFirst.value = false;
        return;
      }
      // Only re-validate if the user is currently authenticated — no
      // point round-tripping to /auth/me for a logged-out user.
      if (!useAuthStore.getState().isAuthenticated) return;
      useAuthStore.getState().validateSession();
    });
    return () => sub.remove();
  }, []);

  // Show the splash colour while the rehydration + validation is in flight
  // so we never flash the home tabs with a doomed token. CustomerNavigator
  // shows its own spinner while !hasHydrated; we just paint the background
  // here so the first paint isn't a white flash.
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" backgroundColor={colors.bgApp} />
      <ErrorBoundary>
        <ToastProvider>
          <View style={{ flex: 1, backgroundColor: colors.bgApp }}>
            <RootNavigator />
          </View>
          <OfflineBanner visible={!isOnline} />
        </ToastProvider>
      </ErrorBoundary>
      {/* Blocking update gate — rendered outside ToastProvider so nothing can appear above it */}
      <ForceUpdateModal visible={forceUpdate} />
    </SafeAreaProvider>
  );
}

export default App;
