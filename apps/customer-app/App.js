import React, { useEffect } from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator, navigationRef } from './src/navigation';
import { colors } from './src/theme';
import { setCustomerTokenProvider } from './src/api';
import { useCustomerRealtime, useLocalNotifications } from './src/hooks';
import { useAuthStore } from './src/stores';

function App() {
  useCustomerRealtime();
  useLocalNotifications(navigationRef);

  useEffect(() => {
    setCustomerTokenProvider(() => useAuthStore.getState().token);
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" backgroundColor={colors.bgApp} />
      <RootNavigator />
    </SafeAreaProvider>
  );
}

export default App;
