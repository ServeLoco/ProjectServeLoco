import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, radius } from '../theme';
import AppIcon from '../components/AppIcon';
import { ShopDashboardScreen, ShopOrdersScreen, ShopProductsScreen } from '../screens/shop';

const Tab = createBottomTabNavigator();

/* Black + saffron glass bar, matching the shop dashboard. */
const BAR = {
  bg: '#0A0A0A',
  rim: 'rgba(255,255,255,0.10)',
  pill: 'rgba(255,122,58,0.18)',
  pillRim: 'rgba(255,138,74,0.45)',
  inactive: 'rgba(255,255,255,0.45)',
};

/**
 * ShopOwnerNavigator
 * Three-tab shop dashboard shown when an authenticated user owns a shop:
 * Dashboard (status + live queue), Orders (full history), and Products
 * (groups). Replaces the customer home for shop owners (see
 * RootNavigator branching).
 */
function TabIcon({ name, focused, size, color }) {
  // Saffron pill grows in behind the active tab's icon.
  const anim = useRef(new Animated.Value(focused ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: focused ? 1 : 0,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [focused, anim]);

  return (
    <View style={styles.iconWrap}>
      <Animated.View
        style={[
          styles.activePill,
          {
            opacity: anim,
            transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }],
          },
        ]}
      />
      <AppIcon name={name} color={color} size={size} />
    </View>
  );
}

export default function ShopOwnerNavigator() {
  const insets = useSafeAreaInsets();

  return (
    /* Black canvas behind the bar — its rounded top corners would otherwise
     * expose the light default navigator background as two pale slivers. */
    <View style={styles.navRoot}>
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.saffron,
        tabBarInactiveTintColor: BAR.inactive,
        tabBarLabelStyle: { fontWeight: '700', fontSize: 11, letterSpacing: 0.2, marginTop: 2 },
        tabBarItemStyle: { paddingTop: 6 },
        tabBarStyle: {
          backgroundColor: BAR.bg,
          borderTopWidth: 1,
          borderTopColor: BAR.rim,
          borderTopLeftRadius: radius.xxl,
          borderTopRightRadius: radius.xxl,
          height: 70 + insets.bottom,
          paddingBottom: 10 + insets.bottom,
          paddingTop: 8,
          elevation: 0,
        },
        sceneContainerStyle: { backgroundColor: '#000000' },
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
    </View>
  );
}

const styles = StyleSheet.create({
  navRoot: { flex: 1, backgroundColor: '#000000' },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 30,
    paddingHorizontal: spacing.md,
  },
  activePill: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radius.pill,
    backgroundColor: BAR.pill,
    borderWidth: 1,
    borderColor: BAR.pillRim,
  },
});
