import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import {
  AdminDashboardScreen,
  AdminLoginScreen,
  AdminOrdersScreen,
  AdminOrderDetailScreen,
  AdminProductsScreen,
  AdminProductFormScreen,
  AdminCustomersScreen,
  AdminSettingsScreen,
} from '../screens';

import { useAdminAuthStore } from '../stores';

const Stack = createNativeStackNavigator();

/**
 * AdminNavigator
 * Admin portal stack.
 */
export default function AdminNavigator() {
  const isAdminAuthenticated = useAdminAuthStore(state => state.isAdminAuthenticated);

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!isAdminAuthenticated ? (
        <Stack.Screen name="AdminLogin" component={AdminLoginScreen} />
      ) : (
        <>
          <Stack.Screen name="AdminDashboard" component={AdminDashboardScreen} />
          <Stack.Screen name="AdminOrders" component={AdminOrdersScreen} />
          <Stack.Screen name="AdminOrderDetail" component={AdminOrderDetailScreen} />
          <Stack.Screen name="AdminProducts" component={AdminProductsScreen} />
          <Stack.Screen name="AdminProductForm" component={AdminProductFormScreen} />
          <Stack.Screen name="AdminCustomers" component={AdminCustomersScreen} />
          <Stack.Screen name="AdminSettings" component={AdminSettingsScreen} />
        </>
      )}
    </Stack.Navigator>
  );
}
