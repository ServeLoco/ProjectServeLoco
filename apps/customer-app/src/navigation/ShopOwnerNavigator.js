import React from 'react';
import { View, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, shadows, spacing, radius } from '../theme';
import AppIcon from '../components/AppIcon';
import { ShopDashboardScreen, ShopOrdersScreen, ShopProductsScreen } from '../screens/shop';

const Tab = createBottomTabNavigator();

/**
 * ShopOwnerNavigator
 * Three-tab shop dashboard shown when an authenticated user owns a shop:
 * Dashboard (status + live queue), Orders (full history), and Products
 * (groups). Replaces the customer home for shop owners (see
 * RootNavigator branching).
 */
function TabIcon({ name, focused, size, color }) {
  return (
    <View style={styles.iconWrap}>
      <AppIcon name={name} color={color} size={size} />
      {focused && <View style={styles.activeDot} />}
    </View>
  );
}

export default function ShopOwnerNavigator() {
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.saffron,
        tabBarInactiveTintColor: colors.navInactive,
        tabBarLabelStyle: { fontWeight: '700', fontSize: 12 },
        tabBarStyle: {
          backgroundColor: colors.navBg,
          borderTopWidth: 0,
          height: 64 + insets.bottom,
          paddingBottom: 8 + insets.bottom,
          paddingTop: 6,
          ...shadows.navBar,
        },
        sceneContainerStyle: { backgroundColor: colors.bgApp },
      }}
    >
      <Tab.Screen
        name="ShopDashboard"
        component={ShopDashboardScreen}
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name="home" color={color} size={size} focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="ShopOrders"
        component={ShopOrdersScreen}
        options={{
          title: 'Orders',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name="orders" color={color} size={size} focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="ShopProducts"
        component={ShopProductsScreen}
        options={{
          title: 'Products',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name="box" color={color} size={size} focused={focused} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 26,
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: radius.circle,
    backgroundColor: colors.saffron,
    marginTop: spacing.xs - 1,
  },
});
