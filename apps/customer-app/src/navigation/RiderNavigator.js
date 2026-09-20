import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';
import TabBarPillButton from '../components/navigation/TabBarPillButton';
import { useRiderLocationPermission } from '../hooks/useRiderLocationPermission';
import { ScreenErrorBoundary } from '../components/ErrorBoundary';
import {
  RiderDashboardScreen,
  RiderHistoryScreen,
  RiderOrderScreen,
  RiderProfileScreen,
} from '../screens/rider';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function RiderTabs() {
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenLayout={({ children, route }) => (
        <ScreenErrorBoundary routeName={route?.name}>{children}</ScreenErrorBoundary>
      )}
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: colors.navBg,
          borderTopWidth: 0,
          borderTopLeftRadius: 26,
          borderTopRightRadius: 26,
          height: 66 + insets.bottom,
          paddingBottom: insets.bottom,
          paddingTop: 0,
        },
        tabBarItemStyle: { height: 66, justifyContent: 'center' },
        sceneContainerStyle: { backgroundColor: colors.bgApp },
      }}
    >
      <Tab.Screen
        name="RiderDashboard"
        component={RiderDashboardScreen}
        options={{
          title: 'Ride',
          tabBarButton: (props) => (
            <TabBarPillButton {...props} name="navigation" label="Ride" />
          ),
        }}
      />
      <Tab.Screen
        name="RiderHistory"
        component={RiderHistoryScreen}
        options={{
          title: 'History',
          tabBarButton: (props) => (
            <TabBarPillButton {...props} name="orders" label="History" />
          ),
        }}
      />
      <Tab.Screen
        name="RiderProfile"
        component={RiderProfileScreen}
        options={{
          title: 'Profile',
          tabBarButton: (props) => (
            <TabBarPillButton {...props} name="profile" label="Profile" />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

/**
 * RiderNavigator — delivery partner shell + full-screen order map.
 */
export default function RiderNavigator() {
  useRiderLocationPermission();

  return (
    <Stack.Navigator
      screenOptions={{ headerShown: false }}
      screenLayout={({ children, route }) => (
        <ScreenErrorBoundary routeName={route?.name}>{children}</ScreenErrorBoundary>
      )}
    >
      <Stack.Screen name="RiderTabs" component={RiderTabs} />
      <Stack.Screen
        name="RiderOrder"
        component={RiderOrderScreen}
        options={{ animation: 'slide_from_right' }}
      />
    </Stack.Navigator>
  );
}
