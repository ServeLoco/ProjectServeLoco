import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors, typography, radius, shadows } from '../theme';
import { AppIcon } from '../components';

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
          position: 'absolute',
          bottom: 12,
          left: 16,
          right: 16,
          borderRadius: radius.xl,
          backgroundColor: colors.bgSurface,
          height: 64,
          elevation: 6,
          ...shadows.lg,
          borderTopWidth: 0,
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
        name="Categories"
        component={CategoriesScreen}
        options={{ tabBarIcon: ({ focused }) => <AnimatedTabIcon name="box" focused={focused} /> }}
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
  return (
    <Stack.Navigator 
      screenOptions={{ 
        headerShown: false,
        animation: 'fade_from_bottom',
        animationDuration: 200,
      }}
    >
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
      
      <Stack.Screen 
        name="Auth" 
        component={AuthScreen} 
        options={{ presentation: 'transparentModal', animation: 'fade' }} 
      />
    </Stack.Navigator>
  );
}
