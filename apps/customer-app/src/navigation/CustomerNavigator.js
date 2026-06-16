import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, StyleSheet, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors, typography, radius, shadows } from '../theme';
import { AppIcon } from '../components';
import { useAuthStore } from '../stores';

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
  NotificationsScreen,
} from '../screens/customer';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function AnimatedTabIcon({ name, focused }) {
  const scale = useRef(new Animated.Value(focused ? 1 : 0.9)).current;
  const opacity = useRef(new Animated.Value(focused ? 1 : 0)).current;
  
  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, {
        toValue: focused ? 1 : 0.9,
        useNativeDriver: true,
        friction: 6,
      }),
      Animated.timing(opacity, {
        toValue: focused ? 1 : 0,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start();
  }, [focused]);

  return (
    <View style={styles.tabIconContainer}>
      <Animated.View
        style={[
          styles.activePill,
          {
            opacity,
            transform: [{ scale }],
          },
        ]}
      />
      <AppIcon
        name={name}
        color={focused ? colors.primaryText : colors.navInactive}
        size={20}
      />
    </View>
  );
}

/**
 * CustomerBottomTabs
 * Main tabs for customer (Home, Orders, Profile).
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
          position: 'absolute',
          bottom: 16,
          left: 72,
          right: 72,
          borderRadius: 30,
          backgroundColor: colors.bgSurface,
          height: 64,
          elevation: 8,
          ...shadows.lg,
          borderWidth: 1,
          borderColor: colors.border,
          borderTopWidth: 1, // enforce consistent border styling around the floating bar
          paddingBottom: 4,
        },
        tabBarLabelStyle: {
          ...typography.caption,
          fontWeight: '600',
          marginTop: 2,
        },
        tabBarIcon: ({ focused }) => (
          <AnimatedTabIcon name="home" focused={focused} />
        ),
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ tabBarIcon: ({ focused }) => <AnimatedTabIcon name="home" focused={focused} /> }}
      />
      <Tab.Screen
        name="Orders"
        component={OrdersScreen}
        options={{ tabBarIcon: ({ focused }) => <AnimatedTabIcon name="orders" focused={focused} /> }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ tabBarIcon: ({ focused }) => <AnimatedTabIcon name="profile" focused={focused} /> }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  bootScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgApp,
  },
  tabIconContainer: {
    width: 48,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginTop: 4,
  },
  activePill: {
    position: 'absolute',
    width: 48,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
});



/**
 * CustomerNavigator
 * Main customer stack holding tabs and sub-screens.
 */
export default function CustomerNavigator() {
  const isAuthenticated = useAuthStore(state => state.isAuthenticated);
  const hasHydrated = useAuthStore(state => state.hasHydrated);
  const sessionChecked = useAuthStore(state => state.sessionChecked);

  // Two-phase gate:
  //   1. Wait for zustand-persist to rehydrate AsyncStorage (so the token
  //      we read is the real one the user had, not null).
  //   2. Wait for the startup validateSession() call (in App.js) to finish
  //      confirming the token against /auth/me. Without this gate the user
  //      would see the home tabs flash for a frame with a token that is
  //      about to be wiped by the validator.
  if (!hasHydrated || !sessionChecked) {
    return (
      <View style={styles.bootScreen}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  return (
    <Stack.Navigator 
      screenOptions={{ 
        headerShown: false,
        animation: 'fade_from_bottom',
        animationDuration: 200,
      }}
    >
      {isAuthenticated ? (
        <>
          <Stack.Screen name="MainTabs" component={CustomerBottomTabs} />
          
          {/* Product Flow */}
          <Stack.Screen name="Categories" component={CategoriesScreen} />
          <Stack.Screen name="ProductList" component={ProductListScreen} />
          <Stack.Screen name="ProductDetail" component={ProductDetailScreen} />
          
          {/* Checkout Flow */}
          <Stack.Screen name="Cart" component={CartScreen} />
          <Stack.Screen name="Checkout" component={CheckoutScreen} />
          <Stack.Screen name="OrderConfirmation" component={OrderConfirmationScreen} />
          
          {/* Account / Misc Flow */}
          <Stack.Screen name="OrderDetail" component={OrderDetailScreen} />
          <Stack.Screen name="EditProfile" component={EditProfileScreen} />
          <Stack.Screen name="Notifications" component={NotificationsScreen} />
        </>
      ) : (
        <Stack.Screen name="Auth" component={AuthScreen} />
      )}
    </Stack.Navigator>
  );
}
