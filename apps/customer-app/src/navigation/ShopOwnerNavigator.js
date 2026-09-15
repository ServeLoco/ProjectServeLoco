import React from 'react';
import { Platform, View, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { glass, glassRadius, spacing } from '../theme';
import TabBarPillButton from '../components/navigation/TabBarPillButton';
import { ShopDashboardScreen, ShopOrdersScreen, ShopProductsScreen } from '../screens/shop';

const Tab = createBottomTabNavigator();

/**
 * Frosted pane behind the tab bar — a real blur of the list scrolling under
 * it, with a whitish glass fill on top.
 *
 * expo-blur only actually blurs on Android when experimentalBlurMethod is set;
 * its default renders a flat tint, which lets bright content read straight
 * through the labels instead of diffusing behind them.
 */
function BarBackground() {
  return (
    <View style={styles.barWrap}>
      <BlurView
        intensity={40}
        tint="dark"
        experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
        style={StyleSheet.absoluteFill}
      >
        <View style={styles.barFill} />
      </BlurView>
    </View>
  );
}

/**
 * ShopOwnerNavigator
 * Three-tab shop dashboard shown when an authenticated user owns a shop:
 * Dashboard (status + live orders), Orders (full history), and Products
 * (groups). Replaces the customer home for shop owners (see
 * RootNavigator branching).
 *
 * Same bar as the rider shell (TabBarPillButton, docked, rounded top) — only
 * the three tabs differ.
 */
export default function ShopOwnerNavigator() {
  const insets = useSafeAreaInsets();

  return (
    /* Black canvas behind the bar — its rounded top corners would otherwise
     * expose the light default navigator background as two pale slivers. */
    <View style={styles.navRoot}>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: false,
          tabBarBackground: () => <BarBackground />,
          // Absolute so the list passes UNDER the bar — a docked bar has only
          // the black canvas behind it, and blurring that is indistinguishable
          // from a flat fill. The screens pad their lists to clear it.
          tabBarStyle: {
            position: 'absolute',
            left: spacing.md,
            right: spacing.md,
            bottom: insets.bottom + spacing.md,
            backgroundColor: 'transparent',
            borderRadius: glassRadius.card,
            height: 66,
            paddingBottom: 0,
            paddingTop: 0,
            overflow: 'hidden',
            elevation: 0,
            borderTopWidth: 0,
            shadowOpacity: 0,
          },
          tabBarItemStyle: { height: 66, justifyContent: 'center' },
          sceneContainerStyle: { backgroundColor: glass.screen },
        }}
      >
        <Tab.Screen
          name="ShopDashboard"
          component={ShopDashboardScreen}
          options={{
            title: 'Dashboard',
            tabBarButton: (props) => (
              <TabBarPillButton {...props} name="home" label="Dashboard" hideIcon />
            ),
          }}
        />
        <Tab.Screen
          name="ShopOrders"
          component={ShopOrdersScreen}
          options={{
            title: 'Orders',
            tabBarButton: (props) => (
              <TabBarPillButton {...props} name="orders" label="Orders" hideIcon />
            ),
          }}
        />
        <Tab.Screen
          name="ShopProducts"
          component={ShopProductsScreen}
          options={{
            title: 'Products',
            tabBarButton: (props) => (
              <TabBarPillButton {...props} name="box" label="Products" hideIcon />
            ),
          }}
        />
      </Tab.Navigator>
    </View>
  );
}

const styles = StyleSheet.create({
  navRoot: { flex: 1, backgroundColor: glass.screen },
  // react-navigation renders tabBarBackground full-width, ignoring
  // tabBarStyle's left/right inset — clip the blur to it ourselves.
  barWrap: {
    ...StyleSheet.absoluteFillObject,
    left: spacing.md,
    right: spacing.md,
    borderRadius: glassRadius.card,
    overflow: 'hidden',
  },
  // Sits on top of the blur, inside the bar — the glass fill itself.
  barFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(26,26,30,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
});
