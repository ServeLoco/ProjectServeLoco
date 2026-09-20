import React from 'react';
import { View, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { glass, glassRadius, spacing } from '../theme';
import TabBarPillButton from '../components/navigation/TabBarPillButton';
import { ShopDashboardScreen, ShopOrdersScreen, ShopProductsScreen } from '../screens/shop';
import { ScreenErrorBoundary } from '../components/ErrorBoundary';

const Tab = createBottomTabNavigator();

/**
 * Frosted pane behind the tab bar — a dark glass fill with a whitish wash on
 * top.
 *
 * This deliberately does NOT pass experimentalBlurMethod. That prop switches
 * expo-blur to Dimezis BlurView on Android, which hangs an onPreDraw listener
 * off the window and redraws the WHOLE React root view tree into its own
 * bitmap every frame in order to blur it. Doing that out-of-band while the
 * tree is changing — i.e. while the products list under this bar is being
 * scrolled — races ViewGroup's pre-ordered child list, and Android throws
 * IndexOutOfBoundsException straight out of dispatchDraw. The process dies
 * instantly, which is why shop owners saw the app close itself mid-scroll.
 * Play Console confirms it: the crash stack ends in
 * eightbitlab.com.blurview.PreDrawBlurController.updateBlur.
 *
 * The bar sits on a black canvas, so a live blur of it was nearly
 * indistinguishable from the flat tint expo-blur paints by default anyway.
 */
function BarBackground() {
  return (
    <View style={styles.barWrap}>
      <BlurView
        intensity={40}
        tint="dark"
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
        screenLayout={({ children, route }) => (
          <ScreenErrorBoundary routeName={route?.name}>{children}</ScreenErrorBoundary>
        )}
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
