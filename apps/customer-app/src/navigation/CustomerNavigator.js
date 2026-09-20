import React, { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Keyboard,
  Linking,
  Platform,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../theme';
import HomeIcon from '../screens/customer/HomeScreen/HomeIcon';
import { useAuthStore, useSettingsStore } from '../stores';
import RetryingImage from '../components/ProductImage/RetryingImage';
import { useSyncCartFreeDeliveryProgress } from '../hooks';
import { ScreenErrorBoundary } from '../components/ErrorBoundary';

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
  RiderTrackingScreen,
  EditProfileScreen,
  AuthScreen,
  NotificationsScreen,
} from '../screens/customer';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const TABS = [
  { name: 'Home',    icon: 'home',    label: 'Home' },
  { name: 'Orders',  icon: 'orders',  label: 'Orders' },
  { name: 'Profile', icon: 'profile', label: 'Profile' },
];

// ─────────────────────────────────────────────────────────────────────────────
// OutlinedTabIcon
// A solid black icon with a white border: white copies of the same icon are
// stacked a hair off-centre in every direction under the black one.
// ─────────────────────────────────────────────────────────────────────────────
const HALO_OFFSETS = [
  [-1.5, 0], [1.5, 0], [0, -1.5], [0, 1.5],
  [-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1],
];

const OutlinedTabIcon = React.memo(function OutlinedTabIcon({ name, size }) {
  return (
    <View style={{ width: size, height: size }}>
      {HALO_OFFSETS.map(([dx, dy], i) => (
        <View
          key={i}
          style={[StyleSheet.absoluteFill, { transform: [{ translateX: dx }, { translateY: dy }] }]}
        >
          <HomeIcon name={name} size={size} color="#FFFFFF" weight="fill" />
        </View>
      ))}
      <HomeIcon name={name} size={size} color={TAB_ICON_COLOR} weight="fill" />
    </View>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// TabItem
// Every animation here is native-driver (transform / opacity only).
// ─────────────────────────────────────────────────────────────────────────────
function TabItem({ tab, focused, onPress }) {
  const iconScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.spring(iconScale, {
        toValue: 0.85,
        friction: 4,
        tension: 250,
        useNativeDriver: true,
      }),
      Animated.spring(iconScale, {
        toValue: 1,
        friction: 5,
        tension: 180,
        useNativeDriver: true,
      }),
    ]).start();
  }, [focused, iconScale]);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={styles.tabItem}
      accessibilityRole="button"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={tab.label}
    >
      {/* Icon — black fill with a white border. Nothing marks the selected tab:
          there are only two pages, so both tabs look the same. */}
      <Animated.View style={{ transform: [{ scale: iconScale }] }}>
        <OutlinedTabIcon name={tab.icon} size={26} />
      </Animated.View>

      {/* Label */}
      <Animated.Text style={styles.tabLabel} numberOfLines={1} allowFontScaling={false}>
        {tab.label}
      </Animated.Text>
    </TouchableOpacity>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NavPromo
// The admin-set image to the right of the nav bar: same height as the bar, no
// background of its own, shown only when an image is set. Tapping opens the
// admin-set link (http/https only); with no link the image is not tappable.
// ─────────────────────────────────────────────────────────────────────────────
function NavPromo() {
  const imageUrl = useSettingsStore((s) => s.navPromoImageUrl);
  const link = useSettingsStore((s) => s.navPromoLink);
  if (!imageUrl) return null;

  const openLink = () => {
    if (typeof link === 'string' && /^https?:\/\//i.test(link)) {
      Linking.openURL(link).catch(() => {});
    }
  };

  const image = (
    <RetryingImage
      uri={imageUrl}
      style={styles.navPromoImage}
      contentFit="contain"
    />
  );

  return link ? (
    <TouchableOpacity
      onPress={openLink}
      activeOpacity={0.8}
      style={styles.navPromo}
      accessibilityRole="link"
      accessibilityLabel="Open offer link"
    >
      {image}
    </TouchableOpacity>
  ) : (
    <View style={styles.navPromo} pointerEvents="none">
      {image}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CustomTabBar
// ─────────────────────────────────────────────────────────────────────────────
function CustomTabBar({ state, navigation }) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();

  // Render-driven hide: when the keyboard opens, unmount the tab bar
  // immediately so it never "flashes" upward. No translate animation
  // (those always have a visible first frame at the wrong position).
  const [keyboardVisible, setKeyboardVisible] = React.useState(false);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setKeyboardVisible(true)
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardVisible(false)
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  if (keyboardVisible) return null;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.tabBarOuter, { paddingBottom: insets.bottom + TAB_BAR_FLOAT_GAP }]}
    >
      <View style={[styles.tabBarCard, { width: (windowWidth * 2) / 3 }]}>
        {/* Frosted glass, same as the Home search bar: a real blur of the page
            scrolling under the pill, a light wash and a soft top highlight.
            Behind the tabs, never touchable. */}
        <BlurView
          pointerEvents="none"
          intensity={22}
          tint="light"
          // No experimentalBlurMethod on Android. That prop switches expo-blur to
          // Dimezis BlurView, which hangs an onPreDraw listener off the window
          // and, every single frame, draws the WHOLE React root view tree into
          // its own bitmap to blur it. Doing that out-of-band while the tree is
          // changing — i.e. while a list under the bar is scrolling — races
          // ViewGroup's pre-ordered child list and Android throws
          // IndexOutOfBoundsException out of dispatchDraw, killing the app.
          // Confirmed in Play Console: the crash stack ends in
          // eightbitlab.com.blurview.PreDrawBlurController.updateBlur.
          // Without it expo-blur paints a flat translucent tint of the same
          // colour, which is what every other BlurView in this app already does.
          style={StyleSheet.absoluteFill}
        />
        <View pointerEvents="none" style={styles.tabBarGlassWash} />
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(255,255,255,0.3)', 'rgba(255,255,255,0)']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {state.routes.map((route, index) => {
          // Profile stays a real tab route (navigate('Profile') keeps working)
          // but has no slot in the bar — Home's top-right icon opens it.
          if (route.name === 'Profile') return null;
          const tab     = TABS[index] || { name: route.name, icon: 'home', label: route.name };
          const focused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          return (
            <TabItem
              key={route.key}
              tab={tab}
              focused={focused}
              onPress={onPress}
            />
          );
        })}
      </View>
      <NavPromo />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CustomerBottomTabs
// ─────────────────────────────────────────────────────────────────────────────
function CustomerBottomTabs() {
  return (
    <Tab.Navigator
      screenLayout={({ children, route }) => (
        <ScreenErrorBoundary routeName={route?.name}>{children}</ScreenErrorBoundary>
      )}
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Home"    component={HomeScreen} />
      <Tab.Screen name="Orders"  component={OrdersScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const TAB_CONTENT_HEIGHT = 62;
// Both tabs: solid black icon and label.
const TAB_ICON_COLOR = '#111111';
// Gap between the floating pill and the bottom of the screen (above the system inset).
const TAB_BAR_FLOAT_GAP = 10;

const styles = StyleSheet.create({
  bootScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgApp,
  },

  // Outer wrapper — sits at the screen bottom; the pill floats above it with
  // a left gap and a bottom gap (added inline with the system inset). The pill
  // is two thirds of the screen wide.
  tabBarOuter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    // Pill sits on the left, lined up with the cart popup above it (16px);
    // the admin's nav image fills the space to its right.
    paddingLeft: 16,
    paddingRight: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },

  // Fills what is left of the row beside the pill; same height as the pill.
  navPromo: {
    flex: 1,
    height: TAB_CONTENT_HEIGHT,
    marginLeft: 8,
  },
  navPromoImage: {
    width: '100%',
    height: '100%',
  },

  // Floating glass pill — fully rounded, detached from the screen edges.
  // No shadow or elevation: both show through a see-through bar (and on
  // Android an elevated see-through view draws a dark square behind it).
  tabBarCard: {
    flexDirection: 'row',
    alignItems: 'center',
    height: TAB_CONTENT_HEIGHT,
    backgroundColor: 'transparent',
    borderRadius: TAB_CONTENT_HEIGHT / 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: TAB_ICON_COLOR,
    paddingHorizontal: 12,
    overflow: 'hidden',
  },
  tabBarGlassWash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },

  // Each tab — equal width, items stacked and centered
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },

  // Label
  tabLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.1,
    includeFontPadding: false,
    lineHeight: 12,
    color: TAB_ICON_COLOR,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// CustomerNavigator — root navigator
// ─────────────────────────────────────────────────────────────────────────────
// Location permission is no longer a navigation gate — the dashboard is
// reachable the instant the user is authenticated. Home itself asks for
// location (inline card in its top slot, see useHomeLocationPermission) so
// browsing was never blocked by a separate full-screen route.
function CustomerNavigatorTree({ isAuthenticated }) {
  // StickyMiniCart free-delivery line: keep store progress synced on every
  // cart change (Home / list / categories), not only Cart/Checkout screens.
  useSyncCartFreeDeliveryProgress({ enabled: isAuthenticated });

  return (
    <Stack.Navigator
      screenLayout={({ children, route }) => (
        <ScreenErrorBoundary routeName={route?.name}>{children}</ScreenErrorBoundary>
      )}
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
          <Stack.Screen name="Categories"    component={CategoriesScreen} />
          <Stack.Screen name="ProductList"   component={ProductListScreen} />
          <Stack.Screen name="ProductDetail" component={ProductDetailScreen} />

          {/* Checkout Flow */}
          <Stack.Screen name="Cart"              component={CartScreen} />
          <Stack.Screen name="Checkout"          component={CheckoutScreen} />
          <Stack.Screen name="OrderConfirmation" component={OrderConfirmationScreen} />

          {/* Account / Misc Flow */}
          <Stack.Screen name="OrderDetail"   component={OrderDetailScreen} />
          <Stack.Screen name="RiderTracking" component={RiderTrackingScreen} />
          <Stack.Screen name="EditProfile"   component={EditProfileScreen} />
          <Stack.Screen name="Notifications" component={NotificationsScreen} />
        </>
      ) : (
        <Stack.Screen name="Auth" component={AuthScreen} />
      )}
    </Stack.Navigator>
  );
}

export default function CustomerNavigator() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const hasHydrated = useAuthStore((s) => s.hasHydrated);

  // Block only until AsyncStorage has rehydrated the store. Once hydrated,
  // render the cached auth state immediately — session validation (/auth/me)
  // runs in the background. If the server rejects the token (401/403),
  // validateSession() calls logout() which flips isAuthenticated → false and
  // this navigator re-renders to the Auth screen automatically.
  if (!hasHydrated) {
    return (
      <View style={styles.bootScreen}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  return <CustomerNavigatorTree isAuthenticated={isAuthenticated} />;
}
