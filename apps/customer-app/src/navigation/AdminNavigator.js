import React from 'react';
import { View, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { colors, shadows, radius } from '../theme';
import AppIcon from '../components/AppIcon';
import {
  AdminDashboardScreen,
  AdminOrdersScreen,
  AdminPeopleScreen,
  AdminNotificationsScreen,
  AdminAnalyticsScreen,
} from '../screens/admin';

const Tab = createBottomTabNavigator();

function TabIcon({ name, focused, size, color }) {
  return (
    <View style={styles.iconWrap}>
      <View style={[styles.iconBubble, focused && styles.iconBubbleActive]}>
        <AppIcon name={name} color={focused ? colors.saffronDark : color} size={size - 1} />
      </View>
      {focused ? <View style={styles.activeDot} /> : <View style={styles.activeDotSpacer} />}
    </View>
  );
}

/**
 * AdminNavigator — mobile Admin Mode shell (ADMIN TASK 7).
 * Tabs per plans/admin-mode-mobile.md §5.1: Home, Orders, People, Alerts, Live.
 * No role switcher — an active mobile admin phone stays in Admin Mode until
 * logout or web deactivates it (see RootNavigator).
 *
 * NOTE: the global AdminNewOrderPopup host (§5.2 / TASK 9.8) and the push
 * notification tap → order-detail routing (TASK 9.9) are not mounted yet —
 * both depend on the Orders screen/detail stack that TASK 9 builds.
 */
export default function AdminNavigator() {
  return (
    <Tab.Navigator
      initialRouteName="AdminHome"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.saffronDark,
        tabBarInactiveTintColor: colors.navInactive,
        tabBarLabelStyle: { fontWeight: '700', fontSize: 11, marginTop: 2 },
        tabBarStyle: {
          backgroundColor: colors.navBg,
          borderTopWidth: 0,
          height: 68,
          paddingBottom: 10,
          paddingTop: 8,
          ...shadows.navBar,
        },
        sceneContainerStyle: { backgroundColor: colors.bgApp },
      }}
    >
      <Tab.Screen
        name="AdminHome"
        component={AdminDashboardScreen}
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name="home" color={color} size={size} focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="AdminOrders"
        component={AdminOrdersScreen}
        options={{
          title: 'Orders',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name="orders" color={color} size={size} focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="AdminPeople"
        component={AdminPeopleScreen}
        options={{
          title: 'People',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name="people" color={color} size={size} focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="AdminAlerts"
        component={AdminNotificationsScreen}
        options={{
          title: 'Alerts',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name="notification" color={color} size={size} focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="AdminLive"
        component={AdminAnalyticsScreen}
        options={{
          title: 'Live',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name="analytics" color={color} size={size} focused={focused} />
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
    minHeight: 30,
  },
  iconBubble: {
    width: 36,
    height: 28,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBubbleActive: {
    backgroundColor: colors.saffronLight,
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: radius.circle,
    backgroundColor: colors.saffron,
    marginTop: 2,
  },
  activeDotSpacer: {
    width: 4,
    height: 4,
    marginTop: 2,
  },
});
