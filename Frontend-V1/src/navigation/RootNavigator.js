import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import CustomerNavigator from './CustomerNavigator';
import AdminNavigator from './AdminNavigator';
import { useAdminAuthStore } from '../stores';

/**
 * RootNavigator
 * Determines whether to show Customer or Admin stack based on isAdminMode.
 */
export default function RootNavigator() {
  const isAdminMode = useAdminAuthStore(state => state.isAdminMode);

  return (
    <NavigationContainer>
      {isAdminMode ? <AdminNavigator /> : <CustomerNavigator />}
    </NavigationContainer>
  );
}
