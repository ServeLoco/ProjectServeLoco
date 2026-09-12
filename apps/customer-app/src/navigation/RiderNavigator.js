import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View, Pressable, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radius } from '../theme';
import AppIcon from '../components/AppIcon';
import { useRiderLocationPermission } from '../hooks/useRiderLocationPermission';
import {
  RiderDashboardScreen,
  RiderHistoryScreen,
  RiderOrderScreen,
  RiderProfileScreen,
} from '../screens/rider';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function TabBarButton({
  name,
  label,
  onPress,
  onLongPress,
  accessibilityState,
  testID,
  ...rest
}) {
  // v7 reports selection via aria-selected; older releases via accessibilityState.
  const focused = Boolean(accessibilityState?.selected ?? rest['aria-selected']);
  const anim = useRef(new Animated.Value(focused ? 1 : 0)).current;

  useEffect(() => {
    // Opacity/transform only, so this runs on the UI thread and a tab switch
    // never waits on JS. Animating the pill's width instead would relayout
    // every frame on the JS thread, which is what made switching feel laggy.
    Animated.timing(anim, {
      toValue: focused ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [anim, focused]);

  const inverse = anim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      accessibilityLabel={label}
      style={styles.tabButton}
    >
      <View style={styles.tabItem}>
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: anim }]}>
          <LinearGradient
            colors={[colors.brandGradientStart, colors.brandGradientEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>

        <View style={styles.iconStack}>
          <Animated.View style={[StyleSheet.absoluteFill, styles.iconLayer, { opacity: inverse }]}>
            <AppIcon name={name} color={colors.navInactive} size={21} />
          </Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, styles.iconLayer, { opacity: anim }]}>
            <AppIcon name={name} color={colors.textInverse} size={21} />
          </Animated.View>
        </View>

        <View style={styles.labelSlot}>
          <Animated.Text
            style={[styles.tabLabel, styles.tabLabelIdle, { opacity: inverse }]}
            numberOfLines={1}
          >
            {label}
          </Animated.Text>
          <Animated.Text
            style={[styles.tabLabel, styles.tabLabelActive, { opacity: anim }]}
            numberOfLines={1}
          >
            {label}
          </Animated.Text>
        </View>
      </View>
    </Pressable>
  );
}

function RiderTabs() {
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
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
            <TabBarButton {...props} name="navigation" label="Ride" />
          ),
        }}
      />
      <Tab.Screen
        name="RiderHistory"
        component={RiderHistoryScreen}
        options={{
          title: 'History',
          tabBarButton: (props) => (
            <TabBarButton {...props} name="orders" label="History" />
          ),
        }}
      />
      <Tab.Screen
        name="RiderProfile"
        component={RiderProfileScreen}
        options={{
          title: 'Profile',
          tabBarButton: (props) => (
            <TabBarButton {...props} name="profile" label="Profile" />
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
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="RiderTabs" component={RiderTabs} />
      <Stack.Screen
        name="RiderOrder"
        component={RiderOrderScreen}
        options={{ animation: 'slide_from_right' }}
      />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    paddingHorizontal: 15,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  iconStack: {
    width: 24,
    height: 24,
  },
  iconLayer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelSlot: {
    height: 18,
    marginLeft: 7,
    justifyContent: 'center',
  },
  tabLabel: {
    fontWeight: '800',
    fontSize: 13,
  },
  // Stacked so the two colours cross-fade without changing layout.
  tabLabelIdle: { color: colors.navInactive },
  tabLabelActive: { ...StyleSheet.absoluteFillObject, color: colors.textInverse },
});
