import React, { useEffect } from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './src/navigation';
import { colors } from './src/theme';
import { setCustomerTokenProvider } from './src/api';
import { useCustomerRealtime } from './src/hooks';
import { useAuthStore } from './src/stores';

function App() {
  useCustomerRealtime();

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
