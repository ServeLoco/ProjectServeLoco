import React, { useEffect } from 'react';
import { StatusBar, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator, navigationRef } from './src/navigation';
import { colors } from './src/theme';
import { setCustomerTokenProvider } from './src/api';
import { setCustomerLogoutHandler } from './src/api/httpClient';
import { useCustomerRealtime, useLocalNotifications } from './src/hooks';
import { useAuthStore } from './src/stores';

function App() {
  useCustomerRealtime();
  useLocalNotifications(navigationRef);

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
  }, []);

  // Startup session check. If there is a token in persisted storage but
  // it has expired (or the server rejects it), validateSession() will call
  // logout() and the navigator will swap the tabs out for the Auth screen
  // on the next render. We wait for zustand-persist's rehydration to finish
  // first by reading hasHydrated.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Wait one tick so the persist middleware finishes rehydrating.
      for (let i = 0; i < 20 && !useAuthStore.getState().hasHydrated; i++) {
        await new Promise((r) => setTimeout(r, 50));
      }
      if (cancelled) return;
      await useAuthStore.getState().validateSession();
    })();
    return () => { cancelled = true; };
  }, []);

  // Show the splash colour while the rehydration + validation is in flight
  // so we never flash the home tabs with a doomed token. CustomerNavigator
  // shows its own spinner while !hasHydrated; we just paint the background
  // here so the first paint isn't a white flash.
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" backgroundColor={colors.bgApp} />
      <View style={{ flex: 1, backgroundColor: colors.bgApp }}>
        <RootNavigator />
      </View>
    </SafeAreaProvider>
  );
}

export default App;
