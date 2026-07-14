import React from 'react';
import { View, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors, shadows, radius } from '../theme';
import AppIcon from '../components/AppIcon';
import { useAdminRealtime } from '../hooks/useAdminRealtime';
import {
  AdminDashboardScreen,
  AdminOrdersScreen,
  AdminOrderDetailScreen,
  AdminNewOrderPopup,
  AdminCancelRequestPopup,
  AdminPeopleScreen,
  AdminNotificationsScreen,
  AdminAnalyticsScreen,
} from '../screens/admin';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

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
 * AdminTabs — the 5 bottom tabs (ADMIN TASK 7).
 * Per plans/admin-mode-mobile.md §5.1: Home, Orders, People, Alerts, Live.
 */
function AdminTabs() {
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

/**
 * AdminNavigator — mobile Admin Mode shell. Wraps AdminTabs in a Stack so
 * AdminOrderDetail can push a full-screen route (covering the tab bar) from
 * any tab, matching how CustomerNavigator lets tab screens push ProductDetail
 * etc. AdminNewOrderPopup is mounted once here, as a sibling to the Stack, so
 * it floats above every tab (ADMIN TASK 9.8) regardless of navigation state.
 * No role switcher — an active mobile admin phone stays in Admin Mode until
 * logout or web deactivates it (see RootNavigator).
 */
export default function AdminNavigator() {
  useAdminRealtime();

  return (
    <>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="AdminTabs" component={AdminTabs} />
        <Stack.Screen name="AdminOrderDetail" component={AdminOrderDetailScreen} />
      </Stack.Navigator>
      <AdminNewOrderPopup />
      <AdminCancelRequestPopup />
    </>
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
