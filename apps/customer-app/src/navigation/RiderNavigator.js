import React from 'react';
import { View, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { colors, shadows, spacing, radius } from '../theme';
import AppIcon from '../components/AppIcon';
import { RiderDashboardScreen, RiderHistoryScreen } from '../screens/rider';

const Tab = createBottomTabNavigator();

function TabIcon({ name, focused, size, color }) {
  return (
    <View style={styles.iconWrap}>
      <AppIcon name={name} color={color} size={size} />
      {focused && <View style={styles.activeDot} />}
    </View>
  );
}

/**
 * RiderNavigator
 * Shown when authenticated user is a rider (not a shop owner).
 */
export default function RiderNavigator() {
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
          height: 64,
          paddingBottom: 8,
          paddingTop: 6,
          ...shadows.navBar,
        },
        sceneContainerStyle: { backgroundColor: colors.bgApp },
      }}
    >
      <Tab.Screen
        name="RiderDashboard"
        component={RiderDashboardScreen}
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name="home" color={color} size={size} focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="RiderHistory"
        component={RiderHistoryScreen}
        options={{
          title: 'History',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name="orders" color={color} size={size} focused={focused} />
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
