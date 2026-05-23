import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors, typography } from '../theme';

import {
  HomeScreen,
  CategoriesScreen,
  OrdersScreen,
  ProfileScreen,
  ProductListScreen,
  ProductDetailScreen,
  CartScreen,
  CheckoutScreen,
  OrderConfirmationScreen,
  OrderDetailScreen,
  EditProfileScreen,
  AuthScreen,
  AdminEntryScreen,
} from '../screens';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

/**
 * CustomerBottomTabs
 * Main tabs for customer (Home, Categories, Orders, Profile).
 * Cart is specifically excluded from tabs.
 */
function CustomerBottomTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          backgroundColor: colors.bgSurface,
          borderTopColor: colors.border,
          elevation: 8,
          height: 60,
          paddingBottom: 8,
        },
        tabBarLabelStyle: {
          ...typography.caption,
          fontWeight: '600',
        },
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Categories" component={CategoriesScreen} />
      <Tab.Screen name="Orders" component={OrdersScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

/**
 * CustomerNavigator
 * Main customer stack holding tabs and sub-screens.
 */
export default function CustomerNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MainTabs" component={CustomerBottomTabs} />
      
      {/* Product Flow */}
      <Stack.Screen name="ProductList" component={ProductListScreen} />
      <Stack.Screen name="ProductDetail" component={ProductDetailScreen} />
      
      {/* Checkout Flow */}
      <Stack.Screen name="Cart" component={CartScreen} />
      <Stack.Screen name="Checkout" component={CheckoutScreen} />
      <Stack.Screen name="OrderConfirmation" component={OrderConfirmationScreen} />
      
      {/* Account / Misc Flow */}
      <Stack.Screen name="OrderDetail" component={OrderDetailScreen} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} />
      <Stack.Screen name="Auth" component={AuthScreen} />
      
      {/* Hidden Admin Entry Route */}
      <Stack.Screen name="AdminEntry" component={AdminEntryScreen} />
    </Stack.Navigator>
  );
}
