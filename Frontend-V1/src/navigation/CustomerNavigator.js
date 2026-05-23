import React, { useEffect, useRef } from 'react';
import { Animated, View, Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors, typography } from '../theme';

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

import {
  AdminEntryScreen,
} from '../screens/admin';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function AnimatedTabIcon({ name, focused, color }) {
  const scale = useRef(new Animated.Value(focused ? 1.15 : 1)).current;
  
  useEffect(() => {
    Animated.spring(scale, {
      toValue: focused ? 1.15 : 1,
      useNativeDriver: true,
      speed: 24,
      bounciness: 8,
    }).start();
  }, [focused, scale]);

  return (
    <Animated.View style={{ transform: [{ scale }], alignItems: 'center', justifyContent: 'center' }}>
      {/* Icon placeholder (e.g. vector icon) */}
      <View style={{ width: 24, height: 24, backgroundColor: color, borderRadius: 12, marginBottom: 2 }} />
      {focused && (
        <View style={{ position: 'absolute', bottom: -10, width: 4, height: 4, borderRadius: 2, backgroundColor: color }} />
      )}
    </Animated.View>
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
          backgroundColor: colors.bgSurface,
          borderTopColor: colors.border,
          elevation: 8,
          height: 60,
          paddingBottom: 8,
        },
        tabBarLabelStyle: {
          ...typography.caption,
          fontWeight: '600',
        },
        tabBarIcon: ({ focused, color }) => (
          <AnimatedTabIcon name={''} focused={focused} color={color} />
        ),
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Categories" component={CategoriesScreen} />
      <Tab.Screen name="Orders" component={OrdersScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

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
      
      {/* Hidden Admin Entry Route */}
      <Stack.Screen name="AdminEntry" component={AdminEntryScreen} />
    </Stack.Navigator>
  );
}
