import React, { useEffect } from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './src/navigation';
import { colors } from './src/theme';
import { setAdminTokenProvider, setCustomerTokenProvider } from './src/api';
import { useAdminAuthStore, useAuthStore } from './src/stores';

function App() {
  useEffect(() => {
    setCustomerTokenProvider(() => useAuthStore.getState().token);
    setAdminTokenProvider(() => useAdminAuthStore.getState().adminToken);
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" backgroundColor={colors.bgApp} />
      <RootNavigator />
    </SafeAreaProvider>
  );
}

export default App;
