import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { colors } from '../theme';
import { ShopHomeScreen, ShopOrdersScreen, ShopProductsScreen } from '../screens/shop';

const Tab = createBottomTabNavigator();

/**
 * ShopOwnerNavigator
 * Three-screen shop dashboard shown when an authenticated user owns a shop.
 * Replaces the customer home for shop owners (see RootNavigator branching).
 */
export default function ShopOwnerNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.saffron,
        tabBarInactiveTintColor: colors.navInactive,
        tabBarStyle: {
          backgroundColor: colors.navBg,
          borderTopColor: colors.border,
        },
      }}
    >
      <Tab.Screen name="ShopHome" component={ShopHomeScreen} options={{ title: 'Shop' }} />
      <Tab.Screen name="ShopOrders" component={ShopOrdersScreen} options={{ title: 'Orders' }} />
      <Tab.Screen name="ShopProducts" component={ShopProductsScreen} options={{ title: 'Products' }} />
    </Tab.Navigator>
  );
}
