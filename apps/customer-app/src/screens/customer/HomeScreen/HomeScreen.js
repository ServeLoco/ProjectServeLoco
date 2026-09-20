import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { Image as ExpoImage } from 'expo-image';
import { addEventListener as addNetInfoListener } from '@react-native-community/netinfo';
import RetryingImage from '../../../components/ProductImage/RetryingImage';
import { normalizeProductCached, orderHomeUnits } from './homeSectionOrder';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  Easing,
  useWindowDimensions,
  RefreshControl,
  TextInput,
  FlatList,
  Pressable,
  Keyboard,
  BackHandler,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AppScreen,
  SegmentedControl,
  CategoryCard,
  ProductCard,
  StickyMiniCart,
  Button,
  LoadingSkeleton,
  PressableScale,
  ReconnectingPill,
  ExitAppModal,
  ErrorState,
  EmptyState,
  VariantSheet,
  ChangeLocationModal,
  LocationPermissionCard,
} from '../../../components';
import { showToast } from '../../../components/Toast';
import { colors, typography, fontSizes, lineHeights, spacing, radius, layout } from '../../../theme';
import HomeIcon from './HomeIcon';
import useAreaLine from './useAreaLine';
import SunCorner from './SunCorner';
import SkyBirds from './SkyBirds';
import SkyCloud from './SkyCloud';
import NightSky from './NightSky';
import RainSky from './RainSky';
import useIsDaytime from './useIsDaytime';
import { useAuthStore, useCartStore, useSettingsStore, useDeliveryLocationStore, useDeliveryZonesStore } from '../../../stores';
import { useAuthGate, useStoreModes, useHomeLocationPermission, buildAreaETag, applyBootstrapResult, syncDeliveryLocation, syncAreaInfo } from '../../../hooks';
import { subscribeProductAvailabilityEvents } from '../../../api/realtimeClient';


import {
  cartApi,
  bootstrapApi,
  dashboardApi,
  notificationsApi,
  productsApi,
  settingsApi,
  subscribeNotificationEvents,
  subscribeRealtimeLifecycle,
  subscribeShopEvents,
} from '../../../api';
import { isFresh, setCached, invalidate } from '../../../utils/apiCache';
import {
  asArray,
  normalizeCategory,
  normalizeImageUrl,
  normalizeProduct,
  normalizeSettings,
} from '../../../utils';
import { dashboardLogo } from '../../../assets';

// Top group background fading into the white page: light sky blue by day
// (suits the golden sun), light black by night (suits the moon and stars).
const DAY_BAR_RGB = '189, 228, 247';
const NIGHT_BAR_RGB = '75, 79, 87';
const RAIN_BAR_RGB = '210, 214, 220'; // light grey
// Eased fade: opacity drops slowly at first, fastest in the middle, and
// slowly again at the end, so there is no visible edge at either side.
const TOP_BAR_FADE_ALPHAS = [1, 0.94, 0.8, 0.58, 0.34, 0.14, 0.04, 0];
const fadeColorsFor = (rgb) => TOP_BAR_FADE_ALPHAS.map((a) => `rgba(${rgb}, ${a})`);
const DAY_FADE_COLORS = fadeColorsFor(DAY_BAR_RGB);
const NIGHT_FADE_COLORS = fadeColorsFor(NIGHT_BAR_RGB);
const RAIN_FADE_COLORS = fadeColorsFor(RAIN_BAR_RGB);
const TOP_BAR_FADE_LOCATIONS = TOP_BAR_FADE_ALPHAS.map((_, i) => i / (TOP_BAR_FADE_ALPHAS.length - 1));

// Search shows at most 6 buyable items; it fetches more so that dropping
// unavailable ones still leaves a full row.
// Left/right space between the screen edge and the Home content.
const PAGE_GUTTER = 10;
// Home draws its sections a few at a time: this many at first, then one more
// each time the customer scrolls within a screen of the end of what is drawn.
const SECTIONS_INITIAL = 2;
// The automatic rows at the end of Home (a row per shop, then a row per category) show this many items each.
const AUTO_BLOCK_LIMIT = 8;
// Waits before retrying an automatic row that failed to load (connection dip).
const AUTO_BLOCK_RETRY_MS = [2000, 4000, 8000, 15000];
// Category card width as a share of the content width (the skeleton uses it too).
const CATEGORY_CARD_RATIO = 0.22;
// First load retries: waits between attempts, and how many misses before the
// "Unable to load" card shows (it keeps retrying behind the card).
const DASHBOARD_RETRY_DELAYS_MS = [1500, 3000, 5000, 8000, 12000];
const DASHBOARD_FAILURES_BEFORE_ERROR = 4;
// A catalog.updated push (admin price/product edit) refetches within this window.
const CATALOG_REFETCH_JITTER_MS = 300;
const SEARCH_RESULT_LIMIT = 6;
const SEARCH_FETCH_LIMIT = 18;

// ── Loading skeleton ─────────────────────────────────────────────────────────
// Built from the same numbers as the real sections (same gutter, card widths,
// aspect ratios and gaps), so the placeholders sit exactly where the content
// will land and nothing jumps when it arrives. Heights are explicit because
// LoadingSkeleton sets its own default height, which would beat an
// aspectRatio and squash the cards into thin bars.
function homeSkeletonSizes(windowWidth) {
  const contentWidth = windowWidth - (PAGE_GUTTER * 2);
  const categoryWidth = Math.floor(contentWidth * CATEGORY_CARD_RATIO);
  const productWidth = Math.floor(contentWidth * 0.4);
  return {
    bannerWidth: contentWidth,
    bannerHeight: Math.round((contentWidth * 8) / 16),
    categoryWidth,
    categoryHeight: Math.round(categoryWidth / 0.9),
    productWidth,
    productHeight: Math.round(productWidth / 0.82),
  };
}

function SkeletonRail({ count, width, height }) {
  return (
    <View style={styles.skeletonRail}>
      {Array.from({ length: count }, (_, i) => (
        <LoadingSkeleton
          key={i}
          width={width}
          height={height}
          borderRadius={radius.lg}
          style={{ marginRight: spacing.md }}
        />
      ))}
    </View>
  );
}

function SkeletonSectionTitle() {
  return (
    <View style={styles.sectionHeader}>
      <LoadingSkeleton width={150} height={18} borderRadius={radius.sm} />
    </View>
  );
}

// The category rail and one product rail as they will really look. With
// `withBanner`, the offer banner and the shop-mode row above them too (the
// full-screen version, where the real ones are not on screen yet).
function HomeSectionsSkeleton({ windowWidth, withBanner = false, modeCount = 2 }) {
  const size = homeSkeletonSizes(windowWidth);
  return (
    <View>
      {withBanner ? (
        <>
          <View style={styles.skeletonModeRow}>
            {Array.from({ length: Math.min(Math.max(modeCount, 2), 5) }, (_, i) => (
              <LoadingSkeleton key={i} width={58} height={58} borderRadius={29} />
            ))}
          </View>
          <View style={styles.offerCarouselSection}>
            <LoadingSkeleton width={size.bannerWidth} height={size.bannerHeight} borderRadius={18} />
          </View>
        </>
      ) : null}
      <View style={styles.section}>
        <SkeletonSectionTitle />
        <SkeletonRail count={4} width={size.categoryWidth} height={size.categoryHeight} />
      </View>
      <View style={styles.section}>
        <SkeletonSectionTitle />
        <SkeletonRail count={3} width={size.productWidth} height={size.productHeight} />
      </View>
    </View>
  );
}

// One product card in a Home rail. Memoised: with stable handlers and cached
// items, tapping Buy re-renders only this card instead of every card on Home.
const HomeProductCard = React.memo(function HomeProductCard({
  item,
  isItemCombo,
  quantity,
  width,
  anim,
  onAdd,
  onIncrement,
  onDecrement,
}) {
  const enter = useMemo(() => anim || new Animated.Value(1), [anim]);
  const translateY = useMemo(
    () => enter.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }),
    [enter]
  );
  return (
    <Animated.View
      style={{
        width,
        marginRight: spacing.md,
        opacity: enter,
        transform: [{ translateY }],
      }}
    >
      <ProductCard
        product={item}
        name={item.name}
        price={item.price}
        originalPrice={item.originalPrice}
        discountLabel={item.discountLabel}
        unit={item.unit}
        isCombo={isItemCombo}
        comboItems={item.comboItems}
        imageUri={item.imageUri}
        quantity={quantity}
        onAdd={() => onAdd(item)}
        onIncrement={() => onIncrement(item)}
        onDecrement={() => onDecrement(item)}
        disabled={!item.available}
        compact
      />
    </Animated.View>
  );
});

// One automatic row at the end of Home. `auto` is a row the server described
// (`autoKind` 'shop' or 'category', `sourceId`, `title`): the shop's or
// category's name, a row of up to AUTO_BLOCK_LIMIT products, and See all when
// there are more. It loads its own products when it is drawn — so with the
// progressive drawing above, a row is only fetched when the customer scrolls
// to it — always fresh from the server. A row with no products draws nothing. `refreshSignal` changes when Home hears of a
// catalog/shop change and refetches quietly (no skeleton).
const AutoProductBlock = React.memo(function AutoProductBlock({
  auto,
  storeType,
  lat,
  lng,
  refreshSignal,
  cardWidth,
  onAdd,
  onIncrement,
  onDecrement,
  onSeeAll,
  canReveal,
  onLoaded,
}) {
  // "Max display items" from the admin's settings for this row (default 8).
  const limit = Number(auto.maxVisibleItems) > 0 ? Number(auto.maxVisibleItems) : AUTO_BLOCK_LIMIT;
  const [loaded, setLoaded] = useState(null); // null = first load still running
  // Re-draw on every cart change so each card's quantity stays right.
  useCartStore((state) => state.items);

  useEffect(() => {
    let cancelled = false;
    let retryTimer = null;
    let attempt = 0;

    const load = () => {
      productsApi.getProducts({
        ...(auto.autoKind === 'shop' ? { shopId: auto.sourceId } : { categoryId: auto.sourceId }),
        type: storeType,
        storeType,
        include_closed_shops: 1,
        // Sellable items first, so the few shown never hide an available one.
        availableFirst: 1,
        limit,
        latitude: lat,
        longitude: lng,
      })
        .then((response) => {
          if (cancelled) return;
          const products = asArray(response, ['products'])
            .map(normalizeProductCached)
            .filter((p) => !(p.isCombo || p.is_combo || p.comboItems?.length));
          // Unavailable / closed-shop items go to the end (stable sort keeps the admin's order).
          products.sort((a, b) => {
            const aOut = !a.available || a.shopIsOpen === false || a.shop_is_open === false;
            const bOut = !b.available || b.shopIsOpen === false || b.shop_is_open === false;
            return aOut === bOut ? 0 : aOut ? 1 : -1;
          });
          const hasMore = Boolean(
            response?.hasMore ?? response?.has_more ?? response?.data?.hasMore ?? response?.data?.has_more
          );
          setLoaded({ items: products.slice(0, limit), hasMore });
        })
        .catch(() => {
          if (cancelled) return;
          // Try again on our own (a dip in the connection), a few times.
          const delay = AUTO_BLOCK_RETRY_MS[Math.min(attempt, AUTO_BLOCK_RETRY_MS.length - 1)];
          attempt += 1;
          retryTimer = setTimeout(load, delay);
        });
    };

    load();
    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
    };
  }, [auto.id, auto.autoKind, auto.sourceId, limit, storeType, lat, lng, refreshSignal]);

  // Tell Home this row has its data, so the rows below it may show theirs.
  useEffect(() => {
    if (loaded) onLoaded?.(auto.id);
  }, [loaded, auto.id, onLoaded]);

  // The row shows its content only once it has loaded AND every row above it
  // has shown theirs — so the page fills in top to bottom, in the admin's
  // order, never from the bottom up. Until then it holds a same-size skeleton.
  const revealed = Boolean(loaded) && canReveal !== false;
  const reveal = useRef(new Animated.Value(revealed ? 1 : 0)).current;
  useEffect(() => {
    if (!revealed) return;
    Animated.timing(reveal, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [revealed, reveal]);

  if (loaded && loaded.items.length === 0) return null;

  const items = loaded ? loaded.items : [];

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.titleRow}>
          <View style={styles.headerIndicator} />
          {auto.sectionIcon ? (
            <HomeIcon name={auto.sectionIcon} size={14} color={colors.primary} style={styles.sectionTypeIcon} />
          ) : null}
          <Text style={styles.sectionTitlePremium} numberOfLines={1}>{auto.title}</Text>
          {auto.showHotBadge === true ? (
            <View style={styles.hotBadge}>
              <LinearGradient
                colors={['#FF6B6B', '#FF8E53']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.hotBadgeGradient}
              >
                <HomeIcon name="star" size={10} color="#FFFFFF" fill="#FFFFFF" style={styles.hotBadgeIcon} />
                <Text style={styles.hotBadgeText}>HOT</Text>
              </LinearGradient>
            </View>
          ) : null}
        </View>
      </View>
      {!revealed ? (
        <SkeletonRail count={3} width={cardWidth} height={Math.round(cardWidth / 0.82)} />
      ) : (
        <Animated.View style={{ opacity: reveal }}>
        <FlatList
          data={items}
          keyExtractor={(item) => String(item.id)}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.productScrollContent}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={4}
          maxToRenderPerBatch={4}
          windowSize={5}
          renderItem={({ item }) => (
            <HomeProductCard
              item={item}
              isItemCombo={false}
              quantity={useCartStore.getState().getProductQuantity(item.id)}
              width={cardWidth}
              onAdd={onAdd}
              onIncrement={onIncrement}
              onDecrement={onDecrement}
            />
          )}
          ListFooterComponent={
            loaded.hasMore || auto.showSeeAll === true ? (
              <View style={styles.seeAllInRowProduct}>
                <SeeAllButton
                  label="See all"
                  onPress={() => onSeeAll(auto)}
                  accessibilityLabel={`See all ${auto.title}`}
                />
              </View>
            ) : null
          }
        />
        </Animated.View>
      )}
    </View>
  );
});

export default function HomeScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  // Top bar look. While the admin's rain charge is on, the rain scene wins
  // over the clock: light grey bar with drifting clouds and falling rain.
  // Otherwise it follows the time of day: day (7 AM – 6 PM IST) is a sky blue
  // bar with sun, cloud and birds; night is a light black bar with a turning
  // moon and twinkling stars.
  const rainChargeEnabled = useSettingsStore(state => state.rainChargeEnabled);
  const isRainy = rainChargeEnabled === true;
  const isDaytime = useIsDaytime();
  const isLightBar = isRainy || isDaytime;
  const barRgb = isRainy ? RAIN_BAR_RGB : isDaytime ? DAY_BAR_RGB : NIGHT_BAR_RGB;
  const barColor = `rgb(${barRgb})`;
  const barFadeColors = isRainy ? RAIN_FADE_COLORS : isDaytime ? DAY_FADE_COLORS : NIGHT_FADE_COLORS;
  // What sits on the bar flips with it: black on a light bar, white on the dark one.
  const onBarColor = isLightBar ? '#111827' : '#FFFFFF';
  const barButtonBg = isLightBar ? '#111827' : '#FFFFFF';
  const barButtonIcon = isLightBar ? '#FFFFFF' : '#111827';
  const { width: windowWidth } = useWindowDimensions();
  const { requireAuth } = useAuthGate();
  
  // Stores
  const items = useCartStore(state => state.items);
  const addItem = useCartStore(state => state.addItem);
  const addCombo = useCartStore(state => state.addCombo);
  const decrementCombo = useCartStore(state => state.decrementCombo);
  const getComboQuantity = useCartStore(state => state.getComboQuantity);
  const getProductQuantity = useCartStore(state => state.getProductQuantity);
  const updateQuantity = useCartStore(state => state.updateQuantity);
  const [variantSheetProduct, setVariantSheetProduct] = useState(null);
  const removeItem = useCartStore(state => state.removeItem);
  const appliedCouponCode = useCartStore(state => state.appliedCouponCode);
  const appliedCouponId = useCartStore(state => state.appliedCouponId);
  const couponAutoApplyDisabled = useCartStore(state => state.couponAutoApplyDisabled);
  const setFreeDeliveryProgress = useCartStore(state => state.setFreeDeliveryProgress);
  const setFreeDeliveryUnlocked = useCartStore(state => state.setFreeDeliveryUnlocked);
  // Bumped by useDeliveryZoneSync on a delivery_zones.updated push (admin
  // saved a zone) — included below purely to retrigger the progress refresh.
  const deliveryZonesVersion = useDeliveryZonesStore(state => state.version);
  const shopStatus = useSettingsStore(state => state.shopStatus);
  const setSettings = useSettingsStore(state => state.setSettings);
  const isSettingsStale = useSettingsStore(state => state.isStale);
  const markSettingsFetched = useSettingsStore(state => state.markFetched);

  // Delivery location — set in the background by useDeliveryLocationSync
  // (live GPS) or manually below (Change Location) when GPS falls outside
  // every admin-configured zone. insideDeliveryZone is null until the first
  // check resolves, so the banner only shows once we actually know.
  const deliveryCoords = useDeliveryLocationStore(state => state.coords);
  const deliveryAreaId = useDeliveryLocationStore(state => state.areaId);
  // TASK 28.3 — dashboard/store-modes fetches key off the live pin (the same
  // resolveCustomerArea chain the pin already drives everywhere else)
  // instead of the server's users.last_area_id/default fallback. A ref, not
  // a dependency, so a sub-meter GPS jitter that doesn't cross a zone
  // boundary never re-triggers loadHomeData's fetch — only an actual zone
  // change (deliveryZoneId, already a dependency below) does.
  const deliveryCoordsRef = useRef(deliveryCoords);
  deliveryCoordsRef.current = deliveryCoords;
  // Boolean, not the coords object: this gates the first dashboard fetch
  // (see the load effect), and a raw GPS fix changes object identity on
  // nearly every fix, which as a dependency would be a refetch storm.
  const hasDeliveryPin = Boolean(deliveryCoords);
  // Read (not written) by loadHomeData to build bootstrap's If-None-Match.
  // Refs, not dependencies — loadHomeData's own success path is what writes
  // these (applyBootstrapResult), so depending on them directly would rebuild
  // the callback on every success and re-fire the mount effect in a loop.
  const deliveryAreaIdRef = useRef(null);
  deliveryAreaIdRef.current = deliveryAreaId;
  const deliveryCatalogVersionRef = useRef(null);
  deliveryCatalogVersionRef.current = useDeliveryLocationStore(state => state.catalogVersion);
  const insideDeliveryZone = useDeliveryLocationStore(state => state.insideZone);
  const deliveryZoneName = useDeliveryLocationStore(state => state.zoneName);
  // Line under the zone name: the address saved on the profile (filled from the
  // customer's orders), else the area of the pin — village/city, state, pin code.
  const savedAddress = useAuthStore(state => state.profile?.address);
  const savedAddressText = typeof savedAddress === 'string' ? savedAddress.trim() : '';
  const areaLine = useAreaLine(deliveryCoords, Boolean(deliveryCoords) && !savedAddressText);
  const locationSubline = deliveryCoords ? (savedAddressText || areaLine) : null;
  const deliveryZoneId = useDeliveryLocationStore(state => state.zoneId);
  const isInitialLocationSyncComplete = useDeliveryLocationStore(state => state.isInitialSyncComplete);
  const recentDeliveryLocations = useDeliveryLocationStore(state => state.recentLocations);
  const setManualDeliveryLocation = useDeliveryLocationStore(state => state.setManualLocation);
  const setDeliveryLocationLabel = useDeliveryLocationStore(state => state.setLocationLabel);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [savingLocation, setSavingLocation] = useState(false);
  // Inline "Enable Location" card (top slot, replaces the old full-screen
  // LocationPermissionGate route) — only shown while there's no usable
  // coords at all. A manual pin or a granted permission both fall straight
  // through to the existing locationBar / out-of-zone EmptyState below,
  // unchanged, so returning users with a saved location never see it.
  const { status: locationPermStatus, requestAllow: requestLocationAllow, openSettings: openLocationSettings } = useHomeLocationPermission();
  const [requestingLocationAllow, setRequestingLocationAllow] = useState(false);
  const needsLocationPermission = !hasDeliveryPin
    && (locationPermStatus === 'denied' || locationPermStatus === 'blocked');
  // Permission granted but the sync still produced no usable fix — GPS timed
  // out, or iOS returned a reduced-accuracy fix that useDeliveryLocationSync
  // rejects (Precise Location off fuzzes to kilometres, far coarser than a
  // ~2km zone). This state used to fall straight through to the dashboard,
  // which then fetched with no pin; the server answers a pinless request from
  // another area entirely, so there is no "show something" option here. Every
  // route to the catalog runs through a resolved live pin or shows a card.
  // Waits for the permission read to settle too: a denied-permission sync
  // bails and marks itself complete almost immediately, which could beat
  // locationPermStatus out of 'checking' and flash this card for an instant
  // before the Allow card it should have shown.
  const locationUnresolved = !hasDeliveryPin && isInitialLocationSyncComplete
    && locationPermStatus !== 'checking' && !needsLocationPermission;
  // Same gate the dashboard body below uses (needsLocationPermission /
  // out-of-zone EmptyState) — the inline dashboard search dropdown hits the
  // same ungated catalog endpoint and was showing results with no location
  // and to customers confirmed outside every zone.
  const isLocationGated = needsLocationPermission || locationUnresolved
    || (isInitialLocationSyncComplete && insideDeliveryZone === false);
  const handleAllowLocation = useCallback(async () => {
    setRequestingLocationAllow(true);
    try {
      await requestLocationAllow();
    } finally {
      setRequestingLocationAllow(false);
    }
  }, [requestLocationAllow]);
  const [isLocationSlow, setIsLocationSlow] = useState(false);
  const [retryingLocation, setRetryingLocation] = useState(false);
  // syncDeliveryLocation dedupes concurrent runs itself and releases its
  // throttle when a run settles nothing, so a retry here always gets a real
  // attempt rather than being swallowed by the 5-minute resume throttle.
  const handleRetryLocation = useCallback(async () => {
    setRetryingLocation(true);
    try {
      await syncDeliveryLocation();
    } finally {
      setRetryingLocation(false);
    }
  }, []);

  useEffect(() => {
    if (isInitialLocationSyncComplete) {
      setIsLocationSlow(false);
      return undefined;
    }
    const timer = setTimeout(() => setIsLocationSlow(true), 2500);
    return () => clearTimeout(timer);
  }, [isInitialLocationSyncComplete]);

  const handleConfirmPickedLocation = useCallback(async (lat, lng, selectedLabel = null) => {
    setSavingLocation(true);
    try {
      const res = await cartApi.calculate({ items: [], latitude: lat, longitude: lng });
      const body = res?.data || res || {};
      const outOfRange = Boolean(body.outOfRange ?? body.out_of_range);
      // An exclusion square blocks delivery while still reporting
      // outOfRange: false — both mean "we can't deliver here".
      const excluded = Boolean(body.excluded ?? body.is_excluded);
      const exclusionMessage = body.exclusionMessage || body.exclusion_message;

      const zone = body.deliveryZone || body.delivery_zone || null;
      const deliverable = !(outOfRange || excluded);
      // Save the pin either way and close the picker — an undeliverable pin
      // still needs to land back on the dashboard, which already renders the
      // "We don't deliver here yet" screen off insideZone === false.
      setManualDeliveryLocation(
        lat,
        lng,
        deliverable,
        deliverable ? (zone?.name || null) : null,
        deliverable ? (zone?.id ?? null) : null,
      );
      if (selectedLabel && deliverable) {
        setDeliveryLocationLabel(selectedLabel);
      }
      setShowLocationPicker(false);
      // cart/calculate above resolves the ZONE. It says nothing about which
      // AREA that zone belongs to, so without this the store keeps the
      // previous area's id, settings (UPI, support number) and socket room
      // while the catalog silently follows the new pin — and the cross-area
      // cart wipe compares against a stale lastAreaId and never fires.
      // Runs for an undeliverable pin too, which is how the stale area gets
      // cleared rather than lingering behind the out-of-zone screen. Awaited
      // so the dashboard behind the picker re-renders against the area it is
      // about to load from.
      await syncAreaInfo(lat, lng);
      if (deliverable) {
        showToast('Delivery location updated', { type: 'success' });
      } else {
        showToast(
          excluded
            ? (exclusionMessage || 'We cannot deliver to that location.')
            : "We don't deliver to that location yet",
          { type: 'error' },
        );
      }
    } catch (_) {
      showToast('Could not verify that location. Please try again.', { type: 'error' });
    } finally {
      setSavingLocation(false);
    }
  }, [setManualDeliveryLocation, setDeliveryLocationLabel]);

  // Keeps StickyMiniCart's "Add ₹X more for FREE delivery" hint (and its
  // progress bar) live on the dashboard the same way Cart/Checkout's bill
  // already is — otherwise it's a snapshot from whenever the user last
  // opened Cart, and a zone change here (or an admin zone-shape push) would
  // leave it advertising a threshold/coupon that no longer applies (or
  // missing one that now does) until the user happens to open Cart again.
  // Only freeDeliveryProgress/freeDeliveryUnlocked are refreshed — the total
  // shown is local subtotal (see StickyMiniCart), not the full priced bill,
  // so there's no need to fetch or store more than that here.
  const homeProgressSeqRef = useRef(0);
  useEffect(() => {
    if (items.length === 0) {
      setFreeDeliveryProgress(null);
      setFreeDeliveryUnlocked(false);
      return undefined;
    }

    const seq = ++homeProgressSeqRef.current;
    const timer = setTimeout(() => {
      const payload = {
        items: items.filter(item => item?.product?.id).map(item => ({
          productId: item.product.id,
          variantId: item.variant?.id ?? null,
          quantity: item.quantity,
          type: item.type || (item.product?.isCombo || item.product?.is_combo ? 'combo' : 'product'),
          isCombo: (item.type || (item.product?.isCombo || item.product?.is_combo ? 'combo' : 'product')) === 'combo',
        })),
        coupon_code: appliedCouponCode || undefined,
        coupon_id: !appliedCouponCode && appliedCouponId ? appliedCouponId : undefined,
        no_auto_apply: couponAutoApplyDisabled,
        latitude: deliveryCoords?.lat,
        longitude: deliveryCoords?.lng,
      };
      cartApi.calculate(payload)
        .then(res => {
          if (seq !== homeProgressSeqRef.current) return; // superseded by a newer change
          const body = res?.data || res || {};
          setFreeDeliveryProgress(body.freeDeliveryProgress || body.free_delivery_progress || null);
          setFreeDeliveryUnlocked(Boolean(
            body.appliedCoupon
            && Number(body.appliedCoupon.freeDeliveryWaiver || 0) > 0,
          ));
        })
        .catch(() => { /* best-effort refresh — Cart's own calc is authoritative */ });
    }, 80);

    return () => clearTimeout(timer);
  }, [
    deliveryZoneId,
    deliveryCoords?.lat,
    deliveryCoords?.lng,
    deliveryZonesVersion,
    items,
    appliedCouponCode,
    appliedCouponId,
    couponAutoApplyDisabled,
    setFreeDeliveryProgress,
    setFreeDeliveryUnlocked,
  ]);

  const { modes, refetchModes } = useStoreModes(deliveryCoords);
  // 'fast_food' is only the pre-fetch fallback — swapped for the admin's
  // configured default mode (store_modes.is_default) once modes load, but
  // only if the user hasn't already switched tabs this session.
  const [storeType, setStoreType] = useState('fast_food');
  const userChangedStoreTypeRef = useRef(false);
  const appliedDefaultModeRef = useRef(false);
  // Also re-applies when the current slug isn't in the loaded modes at all —
  // moving the pin to an area whose admin configured different modes would
  // otherwise keep fetching the dashboard for a slug that area doesn't have,
  // so the sections come back empty until the user taps another tab.
  useEffect(() => {
    if (modes.length === 0) return;
    const hasCurrent = modes.some(m => m.slug === storeType);
    if (hasCurrent && (appliedDefaultModeRef.current || userChangedStoreTypeRef.current)) return;
    const defaultMode = modes.find(m => m.is_default || m.isDefault)
      || (hasCurrent ? null : modes[0]);
    if (!defaultMode) return;
    appliedDefaultModeRef.current = true;
    if (defaultMode.slug !== storeType) {
      setStoreType(defaultMode.slug);
    }
  }, [modes, storeType]);
  const [isLoading, setIsLoading] = useState(true);
  // Cold start only. Once the screen has painted real sections once, a later
  // load (mode switch with nothing prefetched, area change) keeps the header
  // and the mode capsule on screen and skeletons just the sections block —
  // swapping the whole tree for the full-screen skeleton made the capsule the
  // user just tapped disappear under their finger.
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const isHomeLoading = (isLoading && !hasLoadedOnce) || !isInitialLocationSyncComplete;
  const isSectionsLoading = isLoading && hasLoadedOnce;

  // Same 2.5s rule for the catalog fetch itself. The location notice only
  // covers the pin resolve; on a weak link the dashboard request is the part
  // that keeps the skeleton up, with nothing on screen saying why.
  const [isDataSlow, setIsDataSlow] = useState(false);
  useEffect(() => {
    if (!isLoading) {
      setIsDataSlow(false);
      return undefined;
    }
    const timer = setTimeout(() => setIsDataSlow(true), 2500);
    return () => clearTimeout(timer);
  }, [isLoading]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dashboardSections, setDashboardSections] = useState([]);
  // How many of the sections are drawn so far (see SECTIONS_INITIAL).
  const [renderedSectionCount, setRenderedSectionCount] = useState(SECTIONS_INITIAL);
  // Bumped when Home hears of a catalog/shop change; the blocks refetch on it.
  const [autoBlocksRefresh, setAutoBlocksRefresh] = useState(0);
  const sectionTotalRef = useRef(0);
  // Drawn one at a time: the admin's sections first, then one block per category.
  // Automatic rows that have shown their content ({ [autoId]: true }): a row
  // reveals only after every row above it has (see AutoProductBlock).
  const [loadedAutoIds, setLoadedAutoIds] = useState({});
  const handleAutoLoaded = useCallback((autoId) => {
    setLoadedAutoIds((prev) => (prev[autoId] ? prev : { ...prev, [autoId]: true }));
  }, []);
  // The page top to bottom, drawn one unit at a time, in the order the admin
  // set on App Home. Rows Home creates by itself (a row per shop / category,
  // flagged `auto`) are ordinary sections in that list — reordered, hidden or
  // timed exactly like the others. Sections with something to buy come first;
  // last of all, any section whose items are ALL unavailable. Both kinds of
  // section arrive with that answer already in the dashboard (the server says
  // it for automatic rows), so the order is fixed before anything is drawn and
  // the page never reshuffles as rows load. It follows live changes: a section
  // moves the moment its last item goes out of stock, and back when one returns.
  const orderedUnits = useMemo(() => orderHomeUnits(dashboardSections), [dashboardSections]);
  const totalDrawUnits = orderedUnits.length;
  sectionTotalRef.current = totalDrawUnits;
  const scrollMetricsRef = useRef({ offset: 0, viewport: 0, content: 0 });
  // Draw the next section when what is drawn ends less than one screen below
  // the bottom of the view. Lower sections are not built until then, so the
  // top of Home is not slowed down by the parts nobody can see yet.
  const drawMoreIfNeeded = useCallback(() => {
    const { offset, viewport, content } = scrollMetricsRef.current;
    if (!viewport || !content) return;
    if (offset + viewport * 2 < content) return;
    setRenderedSectionCount(count => (count < sectionTotalRef.current ? count + 1 : count));
  }, []);
  const [homeError, setHomeError] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [isSearchOverlayOpen, setIsSearchOverlayOpen] = useState(false);
  const [searchDismissSignal, setSearchDismissSignal] = useState(0);
  const [isExitModalOpen, setIsExitModalOpen] = useState(false);
  const searchBackdropRef = useRef(null);
  // The top group (location row, search bar, closed notice, fade) floats over
  // the page, which scrolls under it, so items dissolve into the top bar colour
  // instead of being cut by a hard line. Its height is measured in parts —
  // never as a whole — so the search results dropping under the bar make the
  // group taller and the page below moves down with it, then back up on close.
  const [searchBarBottom, setSearchBarBottom] = useState(0);
  const [searchDropdownHeight, setSearchDropdownHeight] = useState(0);
  const [topFadeHeight, setTopFadeHeight] = useState(0);
  // Height of the location row — the part that scrolls away. The search bar
  // below it stays pinned to the top.
  const [topRowHeight, setTopRowHeight] = useState(0);
  const scrollY = useRef(new Animated.Value(0)).current;
  const onHomeScroll = useMemo(() => Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    {
      useNativeDriver: true,
      listener: (event) => {
        const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
        const metrics = scrollMetricsRef.current;
        metrics.offset = contentOffset.y;
        metrics.viewport = layoutMeasurement.height;
        metrics.content = contentSize.height;
        drawMoreIfNeeded();
      },
    },
  ), [scrollY, drawMoreIfNeeded]);
  // Left edge of the zone-name text (right of the pin icon) — the line under
  // the address fades out at the middle of the screen, measured from here.
  const [locationBodyX, setLocationBodyX] = useState(0);
  const currentApiStoreType = storeType;
  const cartItemCount = useMemo(
    () => items.reduce((total, item) => total + (Number(item.quantity) || 0), 0),
    [items]
  );
  const cartDisplayTotal = useMemo(
    () => items.reduce((total, item) => total + ((Number(item.variant?.price ?? item.product?.price) || 0) * (Number(item.quantity) || 0)), 0),
    [items]
  );

  // When dashboard product cards refresh, push live catalog prices into cart
  // lines (qty unchanged) so sticky total = price × quantity stays current.
  useEffect(() => {
    if (!Array.isArray(dashboardSections) || dashboardSections.length === 0) return;
    const catalog = [];
    for (const section of dashboardSections) {
      if (section?.sectionType !== 'product_block' && section?.sectionType !== 'combo_block') continue;
      for (const raw of section.items || []) {
        catalog.push(normalizeProduct(raw));
      }
    }
    if (catalog.length > 0) {
      useCartStore.getState().applyCatalogProductPrices(catalog);
    }
  }, [dashboardSections]);

  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  // Crossfade for the sections block only when switching store mode. fadeAnim
  // sits at 1 after the first load, so loadHomeData's entry animation is a
  // no-op on a switch, and it wraps the mode capsule too (fading the control
  // the user just tapped looks broken).
  const sectionsFade = useRef(new Animated.Value(1)).current;

  // Notification badge pulse
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const hotBadgePulse = useRef(new Animated.Value(1)).current;
  const unreadRefreshTimer = useRef(null);
  // Skip the first focus event — the mount effect below already loads the
  // dashboard once. Without this, every screen would double-fetch on mount.
  const hasFocusedOnceRef = useRef(false);

  // Per-mode dashboard cache: switching store type shows the cached sections
  // instantly (no skeleton) while a fresh fetch revalidates in the background.
  const sectionsCacheRef = useRef({});
  // Fresh sections replace the on-screen ones only when something actually
  // changed (price, name, availability, order). An identical reply would
  // otherwise redraw every card for nothing.
  const applySections = React.useCallback((slug, sectionsData) => {
    const previous = sectionsCacheRef.current[slug];
    sectionsCacheRef.current[slug] = sectionsData;
    setDashboardSections(current => {
      if (previous && current === previous && JSON.stringify(previous) === JSON.stringify(sectionsData)) {
        sectionsCacheRef.current[slug] = previous;
        return current;
      }
      return sectionsData;
    });
  }, []);

  // Both caches above are keyed by store type only, so moving the pin into a
  // different delivery zone would keep repainting the previous zone's
  // sections. ProductList/Categories fold zoneId into their cache keys
  // instead; these two are refs (and a prefetch set) rather than keyed
  // lookups, so dropping them wholesale on a zone change is the equivalent.
  // Skipped on the first resolve (null -> id) — nothing is cached yet then,
  // and clearing would only throw away the in-flight mount fetch.
  const lastZoneIdRef = useRef(deliveryZoneId);
  const lastAreaIdRef = useRef(deliveryAreaId);
  useEffect(() => {
    const previousZoneId = lastZoneIdRef.current;
    const previousAreaId = lastAreaIdRef.current;
    const zoneChanged = previousZoneId !== deliveryZoneId;
    const areaChanged = previousAreaId !== deliveryAreaId;
    if (!zoneChanged && !areaChanged) return;
    lastZoneIdRef.current = deliveryZoneId;
    lastAreaIdRef.current = deliveryAreaId;
    // Store modes are area-scoped: a pin outside every zone resolves to
    // areaId null server-side and /store-modes returns [], so the capsule
    // sits on useStoreModes' FALLBACK_MODES (hardcoded Packed Items /
    // Fast Food, no icon URL, no is_default). Refetch on ANY area/zone
    // change — including the first null -> id resolve, which is exactly the
    // out-of-zone -> in-zone move — not only on pull-to-refresh.
    refetchModes();
    // Cleared unconditionally, including on the first null -> id resolve.
    // That case used to be skipped ("nothing is cached yet"), which stopped
    // being true the moment anything populated the cache while the pin was
    // unresolved or outside every zone — the entry is then another area's
    // sections, and loadHomeData's `else if (sectionsCacheRef...)` branch
    // repaints it instead of showing a skeleton. Clearing throws nothing
    // away: an in-flight fetch writes its result here when it resolves, and
    // invalidate('dashboard:') only drops a 15s freshness stamp.
    sectionsCacheRef.current = {};
    invalidate('dashboard:');
  }, [deliveryAreaId, deliveryZoneId, refetchModes]);

  // Staggered entry for cards
  const staggerCatAnims = useRef(Array.from({ length: 12 }, () => new Animated.Value(0))).current;
  const staggerComboAnims = useRef(Array.from({ length: 12 }, () => new Animated.Value(0))).current;

  // Self-healing first load. If the dashboard fetch fails with nothing on
  // screen, retry with a growing wait (1.5s, 3s, 5s, 8s, then every 12s) until
  // it lands — the customer never has to pull to refresh after a dropped
  // connection. `loadHomeDataRef` always points at the latest loadHomeData.
  const dashboardFailuresRef = useRef(0);
  const dashboardRetryTimerRef = useRef(null);
  const loadHomeDataRef = useRef(null);
  const retryDashboardLoadSoon = React.useCallback(() => {
    clearTimeout(dashboardRetryTimerRef.current);
    const delays = DASHBOARD_RETRY_DELAYS_MS;
    const delay = delays[Math.min(dashboardFailuresRef.current - 1, delays.length - 1)] ?? delays[0];
    dashboardRetryTimerRef.current = setTimeout(() => loadHomeDataRef.current?.(false), delay);
  }, []);

  const loadHomeData = React.useCallback((refresh = false) => {
    let isMounted = true;
    if (refresh) {
      setIsRefreshing(true);
      // Mode icons/labels are admin-editable and otherwise only fetched once
      // on mount — pull-to-refresh is the escape hatch to pick up changes.
      refetchModes();
    } else if (!sectionsCacheRef.current[currentApiStoreType]) {
      // Only show the skeleton when we have nothing cached for this mode;
      // otherwise the cached sections stay visible while we revalidate.
      setRenderedSectionCount(SECTIONS_INITIAL);
      setIsLoading(true);
    }
    setHomeError('');

    // TASK 28.7 — the settings half of the old cold-start pair is a clean
    // swap for bootstrap: same 5-min staleness gate, but one round trip also
    // resolves the live pin's area/zone/catalogVersion instead of just
    // settings, and degrades to the exact same users.last_area_id/default
    // fallback settingsApi.getSettings() used when there's no pin yet
    // (permission not granted, cold start still resolving) — see
    // resolveCustomerArea's own chain. Dashboard sections aren't in
    // bootstrap's contract, so getDashboard stays its own call, now also
    // pin-aware (28.3) so it resolves the same area bootstrap just did.
    const bootstrapPromise = (refresh || isSettingsStale())
      ? bootstrapApi.getBootstrap({
        latitude: deliveryCoordsRef.current?.lat,
        longitude: deliveryCoordsRef.current?.lng,
        ifNoneMatch: buildAreaETag({
          areaId: deliveryAreaIdRef.current, zoneId: deliveryZoneId, catalogVersion: deliveryCatalogVersionRef.current,
        }),
      })
      : Promise.resolve(null);

    Promise.allSettled([
      dashboardApi.getDashboard({
        storeType: currentApiStoreType, include_closed_shops: 1,
        latitude: deliveryCoordsRef.current?.lat, longitude: deliveryCoordsRef.current?.lng,
      }),
      bootstrapPromise,
      notificationsApi.getUnreadCount().catch(() => 0),
    ]).then(([dashboardResult, bootstrapResult, notificationsResult]) => {
      if (!isMounted) return;

      if (dashboardResult.status === 'fulfilled') {
        const sectionsData = dashboardResult.value?.data?.sections || [];
        applySections(currentApiStoreType, sectionsData);
        // Only a real paint counts. A cold start that failed must still get
        // the full-screen skeleton on its retry — there is no header to keep
        // on screen yet.
        setHasLoadedOnce(true);
      } else if (sectionsCacheRef.current[currentApiStoreType]) {
        // Revalidation failed but we have cached content — keep showing it.
        setDashboardSections(sectionsCacheRef.current[currentApiStoreType]);
      } else {
        setDashboardSections([]);
        // Nothing to show and the fetch failed (a dip in the connection, say):
        // keep the skeleton up and try again on our own. Only after a few
        // misses does the error card appear — and it keeps retrying behind it.
        dashboardFailuresRef.current += 1;
        retryDashboardLoadSoon();
        if (dashboardFailuresRef.current >= DASHBOARD_FAILURES_BEFORE_ERROR) {
          setHomeError('Unable to load home sections. Pull to retry.');
        }
      }

      if (dashboardResult.status === 'fulfilled') {
        dashboardFailuresRef.current = 0;
        clearTimeout(dashboardRetryTimerRef.current);
      }

      if (bootstrapResult.status === 'fulfilled' && bootstrapResult.value !== null) {
        applyBootstrapResult(bootstrapResult.value);
        markSettingsFetched();
      }

      if (notificationsResult.status === 'fulfilled') {
        setUnreadCount(notificationsResult.value || 0);
      }

      // While quietly retrying a failed first load, stay in the loading state
      // (skeleton) instead of flashing an empty page between attempts.
      const retryingQuietly = dashboardResult.status !== 'fulfilled'
        && !sectionsCacheRef.current[currentApiStoreType]
        && dashboardFailuresRef.current < DASHBOARD_FAILURES_BEFORE_ERROR;
      if (!retryingQuietly) setIsLoading(false);
      setIsRefreshing(false);

      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 400, useNativeDriver: true }),

        Animated.stagger(100, staggerCatAnims.map(anim =>
          Animated.spring(anim, { toValue: 1, useNativeDriver: true, friction: 6 })
        )),

        Animated.stagger(150, staggerComboAnims.map(anim =>
          Animated.spring(anim, { toValue: 1, useNativeDriver: true, friction: 6 })
        )),
      ]).start();
    }).catch(() => {
      if (isMounted) {
        dashboardFailuresRef.current += 1;
        retryDashboardLoadSoon();
        if (dashboardFailuresRef.current >= DASHBOARD_FAILURES_BEFORE_ERROR) {
          setHomeError('Unable to load home data. Pull to retry.');
          setIsLoading(false);
        }
        setIsRefreshing(false);
      }
    });

    return () => {
      isMounted = false;
    };
    // deliveryZoneId is not read in the body — it is here so a zone change
    // rebuilds this callback and re-fires the load effect below, refetching
    // the dashboard for the new zone (the effect above has already dropped
    // the now-wrong cached sections). deliveryCoords/areaId/catalogVersion
    // are read through refs instead of as dependencies — this callback's
    // own success handler (applyBootstrapResult) is what writes areaId/
    // catalogVersion, so depending on them directly would rebuild this
    // callback every time it succeeds, re-firing the mount effect below in
    // an infinite loop.
  }, [currentApiStoreType, deliveryZoneId, fadeAnim, markSettingsFetched, isSettingsStale, slideAnim, staggerCatAnims, staggerComboAnims, refetchModes, applySections]);

  loadHomeDataRef.current = loadHomeData;

  // Connection came back while the first load was still failing: retry now
  // instead of waiting out the timer.
  useEffect(() => {
    let wasConnected = true;
    const unsubscribe = addNetInfoListener((state) => {
      const connected = state.isConnected !== false;
      if (connected && !wasConnected && dashboardFailuresRef.current > 0) {
        clearTimeout(dashboardRetryTimerRef.current);
        loadHomeDataRef.current?.(false);
      }
      wasConnected = connected;
    });
    return () => {
      unsubscribe();
      clearTimeout(dashboardRetryTimerRef.current);
    };
  }, []);

  // No pin, no fetch — ever. A pinless dashboard/bootstrap request makes the
  // server resolve the area from something other than where the customer is
  // standing, and areas are run by separate teams: serving area 1's sections,
  // settings and UPI to someone in area 2 is a cross-team leak, not a
  // degraded-but-useful fallback. The states with no pin render a card (see
  // needsLocationPermission / locationUnresolved) instead of a catalog.
  useEffect(() => {
    if (!hasDeliveryPin) return undefined;
    let cleanupLoad;
    const loadTimer = setTimeout(() => {
      cleanupLoad = loadHomeData(false);
    }, 0);

    return () => {
      clearTimeout(loadTimer);
      cleanupLoad?.();
    };
  }, [loadHomeData, hasDeliveryPin]);

  // Quiet background re-fetch of the dashboard sections AND settings — no
  // loading skeleton, no re-triggered entry animation. Used to catch a shop
  // closing (shop_is_open flipping) or the global Shop Status banner
  // (settings.shop_open) changing while Home stays mounted, without the
  // jarring full reload loadHomeData(false) would cause on every focus.
  const refreshDashboardSilently = React.useCallback(() => {
    // The category blocks at the end of Home refetch on the same trigger.
    setAutoBlocksRefresh((n) => n + 1);
    dashboardApi.getDashboard({
      storeType: currentApiStoreType, include_closed_shops: 1,
      latitude: deliveryCoordsRef.current?.lat, longitude: deliveryCoordsRef.current?.lng,
    })
      .then(response => {
        const sectionsData = response?.data?.sections;
        if (sectionsData) applySections(currentApiStoreType, sectionsData);
      })
      .catch(() => {});
    // 28.6 — pin-aware too, same as loadHomeData's bootstrap call, so a
    // focus/reconnect refresh can't paint a different area's support/UPI.
    settingsApi.getSettings({ latitude: deliveryCoordsRef.current?.lat, longitude: deliveryCoordsRef.current?.lng })
      .then(response => {
        if (response !== null && response !== undefined) {
          setSettings(normalizeSettings(response));
          markSettingsFetched();
        }
      })
      .catch(() => {});
  }, [currentApiStoreType, setSettings, markSettingsFetched, applySections]);

  // Live OOS: when shop/admin marks a product unavailable, grey it out on
  // every product rail immediately (no pull-to-refresh) instead of removing
  // it — ProductCard renders the greyed-out "Item Unavailable" state
  // itself. Available=true → silent dashboard re-fetch so it comes back with
  // fully correct data/ordering.
  useEffect(() => {
    return subscribeProductAvailabilityEvents(({ payload }) => {
      const productId = payload?.productId ?? payload?.id;
      if (productId == null || productId === '') return;
      const available = payload?.available;

      // The automatic shop/category rows hold their own items, so they refetch
      // straight away on any availability change (the sections above patch in place).
      setAutoBlocksRefresh((n) => n + 1);

      if (available === false || available === 0 || available === '0') {
        // Product-only event — products/combos are separate tables with
        // separate id sequences, so a combo_block card can share this
        // numeric id by coincidence. Only patch product_block.
        setDashboardSections((prev) => {
          if (!Array.isArray(prev) || prev.length === 0) return prev;
          return prev.map((section) => {
            if (section?.sectionType !== 'product_block') {
              return section;
            }
            const items = section.items || [];
            let changed = false;
            const nextItems = items.map((item) => {
              if (String(item?.id) !== String(productId)) return item;
              changed = true;
              return { ...item, available: false, isAvailable: false };
            });
            if (!changed) return section;
            return { ...section, items: nextItems };
          });
        });
        return;
      }

      refreshDashboardSilently();
    });
  }, [refreshDashboardSilently]);

  useFocusEffect(
    React.useCallback(() => {
      // Returning to this screen — close any active search and release focus
      setSearchDismissSignal(prev => prev + 1);

      // Silently re-fetch the dashboard on refocus (e.g. back from Cart /
      // Product Detail) so a shop that closed while this screen was
      // backgrounded shows as closed immediately, instead of only after a
      // manual pull-to-refresh or app restart. Skip the very first focus —
      // the mount effect already loaded it once.
      // Freshness throttle (15s): skip if we just revalidated (TASK 16).
      // Unread badge uses socket events + loadHomeData cold-start; no focus poll.
      if (hasFocusedOnceRef.current) {
        const cacheKey = `dashboard:${currentApiStoreType}`;
        if (!isFresh(cacheKey, 15_000)) {
          // Stamp before fetch so rapid re-focuses within 15s skip.
          setCached(cacheKey, true);
          refreshDashboardSilently();
        }
      } else {
        hasFocusedOnceRef.current = true;
        setCached(`dashboard:${currentApiStoreType}`, true);
      }

      return undefined;
    }, [refreshDashboardSilently, currentApiStoreType])
  );

  // Exit-app confirmation on hardware/gesture back. Only registered while
  // Home is the focused screen; navigating away restores normal back
  // behaviour. Returning true from the listener tells the OS "we handled
  // this press" — otherwise the activity would finish before the user
  // confirms.
  useFocusEffect(
    React.useCallback(() => {
      const onBackPress = () => {
        setIsExitModalOpen(true);
        return true;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => sub.remove();
    }, [])
  );

  const queueUnreadRefresh = React.useCallback(() => {
    if (unreadRefreshTimer.current) {
      clearTimeout(unreadRefreshTimer.current);
    }

    unreadRefreshTimer.current = setTimeout(() => {
      notificationsApi.getUnreadCount()
        .then(count => setUnreadCount(count || 0))
        .catch(() => {});
    }, 350);
  }, []);

  useEffect(() => {
    const unsubscribeNotifications = subscribeNotificationEvents(({ eventName, payload }) => {
      if (eventName === 'notification.unread_count.updated') {
        if (unreadRefreshTimer.current) {
          clearTimeout(unreadRefreshTimer.current);
        }
        setUnreadCount(payload?.unreadCount || 0);
        return;
      }

      if (eventName === 'notification.created') {
        queueUnreadRefresh();
      }
    });

    const unsubscribeLifecycle = subscribeRealtimeLifecycle(({ eventName }) => {
      if (eventName === 'reconnected' || eventName === 'foreground') {
        queueUnreadRefresh();
        // App was backgrounded (or the socket dropped) — a shop may have
        // opened/closed in the meantime. Refresh dashboard sections so
        // shop_is_open is current before the user can tap Buy again.
        refreshDashboardSilently();
      }
    });

    // Live push for a shop opening/closing while this screen stays mounted
    // and foregrounded. Card grey-out happens instantly (no network call,
    // same pattern as product-availability below) by patching items whose
    // shopId matches — the ambiguous "shop closed" vs "out of stock" split
    // no longer exists, both render as one unavailable card, so this must
    // flip just as fast as the OOS patch does. The jittered 0–3s full
    // refetch still runs after for data correctness (new/removed items,
    // pricing) without 10k clients thundering-herding the API (TASK 17).
    let shopRefetchTimer = null;
    const unsubscribeShopEvents = subscribeShopEvents(({ eventName, payload }) => {
      // Automatic shop/category rows hold their own items: refetch them now.
      setAutoBlocksRefresh((n) => n + 1);

      if (eventName === 'shop.status.updated') {
        const shopId = payload?.shopId;
        const isOpen = payload?.isOpen;
        if (shopId != null && isOpen != null) {
          setDashboardSections((prev) => {
            if (!Array.isArray(prev) || prev.length === 0) return prev;
            return prev.map((section) => {
              if (section?.sectionType !== 'product_block') return section;
              const items = section.items || [];
              let changed = false;
              const nextItems = items.map((item) => {
                if (String(item?.shopId) !== String(shopId)) return item;
                changed = true;
                return { ...item, shopIsOpen: Boolean(isOpen), shop_is_open: Boolean(isOpen) };
              });
              if (!changed) return section;
              return { ...section, items: nextItems };
            });
          });
        }
      }

      if (shopRefetchTimer) clearTimeout(shopRefetchTimer);
      shopRefetchTimer = setTimeout(() => {
        shopRefetchTimer = null;
        refreshDashboardSilently();
        // catalog.updated is an admin price/product edit: refetch almost at
        // once (tiny jitter) so the new price shows in well under a second.
        // The server-side micro-cache was just busted, so phones that all
        // refetch together each build the response against MySQL. ponytail:
        // add in-flight coalescing to utils/microCache if an area ever has
        // thousands of foregrounded phones at once.
      }, Math.random() * (eventName === 'catalog.updated' ? CATALOG_REFETCH_JITTER_MS : 3000));
    });

    return () => {
      unsubscribeNotifications();
      unsubscribeLifecycle();
      unsubscribeShopEvents();
      if (shopRefetchTimer) clearTimeout(shopRefetchTimer);
      if (unreadRefreshTimer.current) {
        clearTimeout(unreadRefreshTimer.current);
      }
    };
  }, [queueUnreadRefresh, refreshDashboardSilently]);

  const prefetchSectionImages = React.useCallback((sections) => {
    // Pre-warm expo-image's disk cache for every image that will render on the
    // home screen. Images are loaded off the main thread in the background
    // and available instantly when the <Image> mounts.
    if (!sections || sections.length === 0) return;
    const urls = [];
    for (const section of sections) {
      if (section.sectionType === 'offer_banner' && Array.isArray(section.items)) {
        for (const item of section.items) {
          const u = item.details?.imageUrl || item.details?.image_url;
          if (u) urls.push(u);
        }
      } else if ((section.sectionType === 'product_block' || section.sectionType === 'combo_block') && Array.isArray(section.items)) {
        for (const item of section.items) {
          const u = item.imageUrl || item.image_url;
          if (u) urls.push(u);
        }
      }
    }
    if (urls.length > 0) {
      // Fire-and-forget; expo-image deduplicates and handles failures silently.
      ExpoImage.prefetch(urls).catch(() => {});
    }
  }, []);

  useEffect(() => {
    // Only the sections that are drawn; the rest are warmed as they come up.
    prefetchSectionImages(
      orderedUnits
        .slice(0, renderedSectionCount + 1)
        .filter((unit) => unit.kind === 'section')
        .map((unit) => unit.section)
    );
  }, [orderedUnits, renderedSectionCount, prefetchSectionImages]);

  // After each section is drawn, look again (once layout has settled): the
  // screen may still not be filled, and a section that draws nothing would
  // otherwise leave no size change to trigger the next one.
  useEffect(() => {
    if (renderedSectionCount >= totalDrawUnits) return undefined;
    // One frame apart: the rows' skeletons appear together, not one by one.
    const timer = setTimeout(drawMoreIfNeeded, 16);
    return () => clearTimeout(timer);
  }, [renderedSectionCount, totalDrawUnits, drawMoreIfNeeded]);

  useEffect(() => {
    // 1. Badge pulse/glow loop animation (1.0 to 2.0 scale)
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 2.0,
          duration: 1600,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1.0,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    );
    pulseLoop.start();

    // HOT badge subtle pulse (scale 1 -> 1.08)
    const hotPulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(hotBadgePulse, {
          toValue: 1.08,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(hotBadgePulse, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
      ])
    );
    hotPulseLoop.start();

    return () => {
      pulseLoop.stop();
      hotPulseLoop.stop();
    };
  }, [pulseAnim, hotBadgePulse]);

  const handleSearchPress = (query) => {
    // Search across both modes (packed + fast food) so users
    // find items regardless of the currently selected segment.
    navigation.navigate('ProductList', {
      mode: 'search',
      storeType: 'all',
      initialQuery: typeof query === 'string' ? query : undefined,
    });
  };

  // See all on an automatic row: a shop's row opens that shop's items, a
  // category's row opens the category.
  const handleAutoSeeAll = (auto) => {
    if (auto.autoKind === 'shop') {
      navigation.navigate('ProductList', { shopId: auto.sourceId, sectionTitle: auto.title, storeType: currentApiStoreType });
    } else {
      navigation.navigate('ProductList', { categoryId: auto.sourceId, categoryName: auto.title, storeType: currentApiStoreType });
    }
  };

  const handleCategoryPress = (category) => {
    navigation.navigate('ProductList', { categoryId: category.id, categoryName: category.name, storeType: currentApiStoreType });
  };

  // Segment control only — no swipe-to-switch (avoids clashing with rails).
  // Reacts at once on tap — the old sections clear right away and the new
  // mode's loading state fades in — then fresh data replaces it.
  const selectStoreType = useCallback((val) => {
    if (!val || val === storeType) return;
    userChangedStoreTypeRef.current = true;
    // Data is never reused from an earlier visit: the new mode always loads
    // fresh from the server, so names, prices and availability are current.
    delete sectionsCacheRef.current[val];
    // A failed load of the mode we are leaving must not count against this one.
    dashboardFailuresRef.current = 0;
    clearTimeout(dashboardRetryTimerRef.current);
    setRenderedSectionCount(SECTIONS_INITIAL);
    setLoadedAutoIds({});
    setDashboardSections([]);
    setIsLoading(true);
    setStoreType(val);
    sectionsFade.stopAnimation();
    sectionsFade.setValue(0.4);
    Animated.timing(sectionsFade, { toValue: 1, duration: 160, useNativeDriver: true }).start();
  }, [storeType, sectionsFade]);

  const handleProductPress = (product) => {
    const isCombo = product.isCombo || product.is_combo || product.comboItems?.length;
    navigation.navigate('ProductDetail', {
      id: product.id,
      type: isCombo ? 'combo' : 'product',
      product,
    });
  };

  const handleAddToCart = React.useCallback((product) => {
    requireAuth(null, () => {
      if (product.isCombo || product.is_combo || product.comboItems?.length) {
        addCombo(product);
      } else if ((product.variants?.length ?? 0) > 1) {
        setVariantSheetProduct(product);
      } else {
        addItem(product, 1, product.variants?.[0] ?? null);
      }
    });
  }, [requireAuth, addCombo, addItem]);

  const handleIncrement = React.useCallback((product) => {
    requireAuth(null, () => {
      if (product.isCombo || product.is_combo || product.comboItems?.length) {
        addCombo(product);
      } else {
        // Reuse the variant already in the cart for this product (single-
        // variant products are stored WITH their variant attached — adding
        // with variant=null here would miss the match and create a
        // duplicate line instead of incrementing it).
        // Read the cart at tap time (not from the render's `items`) so this
        // handler stays the same function when the cart changes — that keeps
        // every product card from re-rendering on each add.
        const existing = useCartStore.getState().items.find(i => i.product.id === product.id && (i.type || 'product') !== 'combo');
        addItem(product, 1, existing?.variant ?? product.variants?.[0] ?? null);
      }
    });
  }, [requireAuth, addCombo, addItem]);

  const handleDecrement = React.useCallback((product) => {
    if (product.isCombo || product.is_combo || product.comboItems?.length) {
      decrementCombo(product);
      return;
    }

    const existing = useCartStore.getState().items.find(i => i.product.id === product.id && (i.type || 'product') !== 'combo');
    const variantId = existing?.variant?.id ?? null;
    const currentQty = existing?.quantity || 0;
    if (currentQty <= 1) {
      removeItem(product.id, 'product', variantId);
    } else {
      updateQuantity(product.id, currentQty - 1, 'product', variantId);
    }
  }, [decrementCombo, removeItem, updateQuantity]);

  const handleCartPress = React.useCallback(() => {
    navigation.navigate('Cart');
  }, [navigation]);


  // The home error card sits between the top group and the list, so the list
  // only slides under the fade when that card is not showing.
  // The results height only counts while the results are showing — a late
  // layout report from a closing dropdown must never leave a gap behind.
  const topGroupHeight = topRowHeight + searchBarBottom
    + (isSearchOverlayOpen ? searchDropdownHeight : 0) + topFadeHeight;
  const fadeOverlap = !isHomeLoading && homeError ? 0 : topGroupHeight;

  // Scrolling up slides the group up by the location row's height and fades
  // that row out; then it stops, leaving the search bar pinned at the top.
  const collapseDistance = Math.max(topRowHeight, 1);
  const topGroupTranslateY = scrollY.interpolate({
    inputRange: [0, collapseDistance],
    outputRange: [0, -collapseDistance],
    extrapolate: 'clamp',
  });
  const topRowOpacity = scrollY.interpolate({
    inputRange: [0, collapseDistance * 0.7],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const categoryGap = spacing.md;
  const contentWidth = windowWidth - (PAGE_GUTTER * 2);
  // Horizontal-scrolling cards: ~28% of content width so the next card peeks
  // (peek effect — multiple cards visible at once).
  const categoryCardWidth = Math.floor(contentWidth * CATEGORY_CARD_RATIO);

  const comboGap = spacing.sm;
  const comboGridWidth = windowWidth - (spacing.md * 2);
  void comboGridWidth; // kept for future layout calculations
  void comboGap;

  return (
    <AppScreen
      style={styles.container}
      bg={barColor}
      safeAreaBottom={false}
      safeAreaTop={true}
      statusBarStyle={isLightBar ? 'dark-content' : 'light-content'}
    >
      {/* Top group — location row, search bar and the closed-shop notice share
          one light-sky-blue background. It is solid down to the search bar, then fades
          into the white page below. It floats over the page (the spacer below
          keeps its place in the layout) so the page can scroll under it. */}
      <Animated.View
        style={[styles.topGroup, { transform: [{ translateY: topGroupTranslateY }] }]}
        pointerEvents="box-none"
      >
        <View style={[styles.topSolid, { backgroundColor: barColor }]}>
          {/* Decoration, never touchable, fading out with the location row when the
              page scrolls. Rain charge on: grey clouds and falling rain, whatever the
              time. Otherwise, day (7 AM – 6 PM IST): a sun in the top-right corner
              (reaching up behind the status bar) with thin beams across the bar,
              one small cloud drifting across the top row, and black birds gliding
              under the search bar. Night: a slowly turning moon and twinkling stars. */}
          <Animated.View pointerEvents="none" style={[styles.topBarDecor, { opacity: topRowOpacity }]}>
            {isRainy ? (
              <RainSky
                width={windowWidth}
                minY={-insets.top}
                bottom={topRowHeight + searchBarBottom}
              />
            ) : isDaytime ? (
              <>
                <SunCorner
                  style={{ top: 8 - insets.top, right: 8 }}
                  width={windowWidth - 8}
                  height={topRowHeight + searchBarBottom + insets.top - 8}
                />
                <SkyCloud top={4} width={windowWidth} />
                <SkyBirds top={topRowHeight + searchBarBottom + 4} width={windowWidth} />
              </>
            ) : (
              <NightSky
                width={windowWidth}
                minY={4 - insets.top}
                maxY={topRowHeight + 6}
                moonCenter={{ x: windowWidth - 128, y: 16 }}
              />
            )}
          </Animated.View>
          {/* Top row — delivery location (zone name) on the left, Notifications and Profile on the right. */}
          <Animated.View
            style={[styles.topRow, { opacity: topRowOpacity }]}
            onLayout={(e) => setTopRowHeight(Math.round(e.nativeEvent.layout.height))}
          >
            <View style={styles.topRowLocation}>
              {/* Second clause (isInitialLocationSyncComplete, no deliveryCoords) is the
                  "Set" affordance restored after dd4f15d: a customer whose GPS never
                  resolves must still have a way to open the picker and set a location
                  manually, instead of the bar just never rendering. */}
              {(deliveryCoords ? insideDeliveryZone !== false : isInitialLocationSyncComplete) && (
                <PressableScale
                  style={styles.locationBar}
                  onPress={() => setShowLocationPicker(true)}
                  accessibilityRole="button"
                  accessibilityLabel={deliveryCoords ? 'Change delivery location' : 'Set delivery location'}
                >
                  <HomeIcon name="location" size={24} color={onBarColor} />
                  <View
                    style={styles.locationBarBody}
                    onLayout={(e) => setLocationBodyX(Math.round(e.nativeEvent.layout.x))}
                  >
                    <Text style={[styles.locationBarText, !isLightBar && styles.barTextNight]} numberOfLines={1}>
                      {/* zoneName is only ever set in zone-pricing mode. On a flat-pricing
                          install it stays null forever, so the "finding" placeholder must
                          not outlive the initial sync. deliveryCoords absent (this block
                          only renders that case once sync is complete — see the outer
                          condition) means GPS genuinely never resolved, distinct from
                          still-resolving. */}
                      {!deliveryCoords
                        ? 'Enable location'
                        : deliveryZoneName
                          || (isInitialLocationSyncComplete ? 'Delivery location' : 'Finding your area…')}
                    </Text>
                    {locationSubline ? (
                      <Text style={[styles.locationBarAddress, !isLightBar && styles.barTextNight]} numberOfLines={1}>{locationSubline}</Text>
                    ) : null}
                    <LinearGradient
                      colors={[onBarColor, isLightBar ? 'rgba(17, 24, 39, 0)' : 'rgba(255, 255, 255, 0)']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={[styles.locationBarLine, { width: Math.max(0, windowWidth / 2 - spacing.md - locationBodyX) }]}
                    />
                  </View>
                </PressableScale>
              )}
            </View>
            <TouchableOpacity
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
              onPress={() => navigation.navigate('Notifications')}
              style={[styles.headerIconButton, { backgroundColor: barButtonBg }]}
            >
              <HomeIcon name="notification" size={18} color={barButtonIcon} />
              {unreadCount > 0 && (
                <View style={styles.headerBadge}>
                  <Text style={styles.headerBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel="Profile"
              onPress={() => navigation.navigate('Profile')}
              style={[styles.headerIconButton, { backgroundColor: barButtonBg }]}
            >
              <HomeIcon name="profile" size={18} color={barButtonIcon} />
            </TouchableOpacity>
          </Animated.View>

          <HomeHeader
            unreadCount={unreadCount}
            pulseAnim={pulseAnim}
            onNotificationsPress={() => navigation.navigate('Notifications')}
            onCartPress={() => navigation.navigate('Cart')}
            cartItemCount={cartItemCount}
            onSearchPress={handleSearchPress}
            onProductPress={handleProductPress}
            onSearchOpenChange={setIsSearchOverlayOpen}
            isLocationGated={isLocationGated}
            dismissSignal={searchDismissSignal}
            cartItems={items}
            addItem={addItem}
            updateQuantity={updateQuantity}
            removeItem={removeItem}
            requireAuth={requireAuth}
            onOpenVariantSheet={setVariantSheetProduct}
            deliveryCoords={deliveryCoords}
            onBarLayout={setSearchBarBottom}
            onDropdownHeight={setSearchDropdownHeight}
            isDarkGlass={!isLightBar}
          />
        </View>

        <LinearGradient
          colors={barFadeColors}
          locations={TOP_BAR_FADE_LOCATIONS}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.topFade}
          pointerEvents="none"
          onLayout={(e) => setTopFadeHeight(Math.round(e.nativeEvent.layout.height))}
        >
          {shopStatus === 'closed' && (
            <View style={styles.closedBanner}>
              <Text style={styles.closedText}>Shop is currently closed. We are not accepting orders.</Text>
            </View>
          )}
        </LinearGradient>
      </Animated.View>
      <View style={{ height: topGroupHeight }} />

      {/* Search backdrop — dims the dashboard so the dropdown reads clearly */}
      {isSearchOverlayOpen && (
        <Pressable
          ref={searchBackdropRef}
          style={styles.searchBackdrop}
          onPress={() => setSearchDismissSignal(prev => prev + 1)}
          accessibilityLabel="Dismiss search"
        />
      )}

      {needsLocationPermission ? (
        <LocationPermissionCard
          variant={locationPermStatus}
          requesting={requestingLocationAllow}
          onAllow={handleAllowLocation}
          onOpenSettings={openLocationSettings}
          onPickManually={() => setShowLocationPicker(true)}
        />
      ) : locationUnresolved ? (
        <EmptyState
          icon={<HomeIcon name="location" size={56} color={colors.textTertiary} />}
          title="Couldn't pin your location"
          subtitle={locationPermStatus === 'granted'
            ? 'We need an exact location to show what we deliver here. On iPhone, check Precise Location is on for VillKro in Settings, or set your delivery spot on the map.'
            : 'We need your location to show what we deliver here. Try again, or set your delivery spot on the map.'}
          actionLabel={retryingLocation ? 'Locating…' : 'Try again'}
          onAction={handleRetryLocation}
          style={styles.emptyState}
        />
      ) : isInitialLocationSyncComplete && insideDeliveryZone === false ? (
        <EmptyState
          icon={<HomeIcon name="location" size={56} color={colors.textTertiary} />}
          title="We don't deliver here yet"
          subtitle="We're expanding rapidly and hope to serve your location soon. Thank you for your patience."
          actionLabel="Change Location"
          onAction={() => setShowLocationPicker(true)}
          style={styles.emptyState}
        />
      ) : !isHomeLoading && homeError && dashboardSections.length === 0 ? (
        <ErrorState
          message="Unable to load home. Tap to retry."
          onRetry={() => loadHomeData(true)}
          retryLabel="Retry"
        />
      ) : (
        <>
          {!isHomeLoading && homeError ? (
            <View style={styles.homeErrorCard}>
              <Text style={styles.homeErrorText}>{homeError}</Text>
              <Button label="Retry" size="small" variant="outline" onPress={() => loadHomeData(true)} />
            </View>
          ) : null}

          {isHomeLoading || (!deliveryCoords && locationPermStatus === 'checking') ? (
        <ScrollView
          style={[styles.skeletonContainer, { marginTop: -fadeOverlap, paddingTop: fadeOverlap }]}
          refreshControl={
            <RefreshControl
              progressViewOffset={fadeOverlap}
              refreshing={isRefreshing}
              onRefresh={() => loadHomeData(true)}
              tintColor={colors.primary}
              colors={[colors.primary, colors.success, colors.saffron]}
              title="Refreshing ServeLoco"
              titleColor={colors.textSecondary}
            />
          }
        >
          {isLocationSlow ? (
            <Text style={[styles.locationLoadingNotice, styles.skeletonNotice]}>Slow internet — setting your delivery location…</Text>
          ) : isDataSlow ? (
            <Text style={[styles.locationLoadingNotice, styles.skeletonNotice]}>Slow internet — still loading items…</Text>
          ) : null}
          <HomeSectionsSkeleton windowWidth={windowWidth} withBanner modeCount={modes.length} />
        </ScrollView>
      ) : (
        <Animated.ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingTop: fadeOverlap }]}
          showsVerticalScrollIndicator={false}
          style={{ marginTop: -fadeOverlap, opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}
          onScroll={onHomeScroll}
          onLayout={(event) => {
            scrollMetricsRef.current.viewport = event.nativeEvent.layout.height;
            drawMoreIfNeeded();
          }}
          onContentSizeChange={(_, height) => {
            scrollMetricsRef.current.content = height;
            drawMoreIfNeeded();
          }}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              progressViewOffset={fadeOverlap}
              refreshing={isRefreshing}
              onRefresh={() => loadHomeData(true)}
              tintColor={colors.primary}
              colors={[colors.primary, colors.success, colors.saffron]}
              title="Refreshing ServeLoco"
              titleColor={colors.textSecondary}
            />
          }
        >
          {/* Store Type Toggle */}
          <View style={styles.toggleContainer}>
            <SegmentedControl
              options={modes.map(m => m.slug)}
              renderLabel={(slug) => modes.find(m => m.slug === slug)?.label || slug}
              renderIconUrl={(slug) => modes.find(m => m.slug === slug)?.iconImageUrl || modes.find(m => m.slug === slug)?.icon_image_url}
              selectedOption={storeType}
              onSelect={selectStoreType}
              style={styles.toggleCardBare}
            />
          </View>

          {/* Dynamic Sections */}
          <Animated.View style={{ opacity: sectionsFade }}>
          {isSectionsLoading ? (
            <View>
              {isDataSlow ? (
                <Text style={[styles.locationLoadingNotice, styles.skeletonNotice]}>Slow internet — still loading items…</Text>
              ) : null}
              <HomeSectionsSkeleton windowWidth={windowWidth} />
            </View>
          ) : null}
          {(() => {
            // Every automatic row above the current one has shown its content?
            let rowsAboveRevealed = true;
            return orderedUnits.slice(0, renderedSectionCount).map(unit => {
            if (unit.kind === 'auto') {
              const { auto } = unit;
              const canReveal = rowsAboveRevealed;
              if (!loadedAutoIds[auto.id]) rowsAboveRevealed = false;
              return (
                <AutoProductBlock
                  key={`${currentApiStoreType}:${auto.id}`}
                  auto={auto}
                  storeType={currentApiStoreType}
                  lat={deliveryCoords?.lat}
                  lng={deliveryCoords?.lng}
                  refreshSignal={autoBlocksRefresh}
                  cardWidth={Math.floor((windowWidth - (PAGE_GUTTER * 2)) * 0.4)}
                  onAdd={handleAddToCart}
                  onIncrement={handleIncrement}
                  onDecrement={handleDecrement}
                  onSeeAll={handleAutoSeeAll}
                  canReveal={canReveal}
                  onLoaded={handleAutoLoaded}
                />
              );
            }
            const { section } = unit;
            // A section below a row that has not shown its content yet waits
            // behind a skeleton, so the page fills in strictly top to bottom.
            if (!rowsAboveRevealed) {
              const waitingSizes = homeSkeletonSizes(windowWidth);
              return (
                <View key={section.id} style={styles.section}>
                  <SkeletonSectionTitle />
                  <SkeletonRail count={3} width={waitingSizes.productWidth} height={waitingSizes.productHeight} />
                </View>
              );
            }
            if (section.sectionType === 'offer_banner') {
              return (
                <OfferBannerCarousel
                  key={section.id}
                  offers={section.items}
                  bannerWidth={windowWidth - (PAGE_GUTTER * 2)}
                  onOfferPress={(offer) => navigation.navigate('ProductList', {
                    offerId: offer.id,
                    offerTitle: offer.title,
                    storeType: currentApiStoreType,
                  })}
                />
              );
            }

            if (section.sectionType === 'category_grid') {
              const normalizedItems = section.items.map(normalizeCategory);
              // Honour the admin-configured `max_visible_items` from the
              // dashboard section. The API already caps `section.items` at
              // that value, but re-applying the cap here defends against any
              // future payload that exceeds it and lets the rail reflect the
              // admin's intent even when the API limit grows.
              // Fallback: show whatever the API sent (no client-side truncation).
              const maxVisible = Number(section.maxVisibleItems) || normalizedItems.length;
              const visibleItems = normalizedItems.slice(0, maxVisible);
              // "See all" pill is shown at the end of the rail when the
              // admin has more categories than are displayed here.
              // Primary signal: API's `hasMore`. Fallback: totalItems > items.
              // Safety net: more than 2 categories in total.
              const totalCount = Number(section.totalItems) || normalizedItems.length;
              const hasMore =
                section.hasMore === true ||
                totalCount > normalizedItems.length ||
                normalizedItems.length > 2;
              return (
                <View key={section.id} style={styles.section}>
                  {!!section.title && (
                    <View style={styles.sectionHeader}>
                      <View style={styles.titleRow}>
                        <View style={styles.headerIndicator} />
                        {(section.sectionIcon === 'box' || (!section.sectionIcon && section.sectionType === 'category_grid')) && (
                          <HomeIcon name="box" size={14} color={colors.primary} style={styles.sectionTypeIcon} />
                        )}
                        {section.sectionIcon && section.sectionIcon !== 'box' && (
                          <HomeIcon name={section.sectionIcon} size={14} color={colors.primary} style={styles.sectionTypeIcon} />
                        )}
                        <Text style={styles.sectionTitlePremium}>{section.title}</Text>
                        {section.showHotBadge === true && (
                          <Animated.View style={[styles.hotBadge, { transform: [{ scale: hotBadgePulse }] }]}>
                            <LinearGradient
                              colors={['#FF6B6B', '#FF8E53']}
                              start={{ x: 0, y: 0 }}
                              end={{ x: 1, y: 1 }}
                              style={styles.hotBadgeGradient}
                            >
                              <HomeIcon name="star" size={10} color="#FFFFFF" fill="#FFFFFF" style={styles.hotBadgeIcon} />
                              <Text style={styles.hotBadgeText}>HOT</Text>
                            </LinearGradient>
                          </Animated.View>
                        )}
                      </View>
                    </View>
                  )}
                  <Animated.FlatList
                    data={visibleItems}
                    keyExtractor={(item) => String(item.id)}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.categoryScrollContent}
                    keyboardShouldPersistTaps="handled"
                    style={styles.categoryScroll}
                    renderItem={({ item: cat, index: idx }) => (
                      <Animated.View
                        style={{
                          width: categoryCardWidth,
                          marginRight: idx === visibleItems.length - 1 ? categoryGap : categoryGap,
                          opacity: staggerCatAnims[idx] || 1,
                          transform: [{
                            translateY: (staggerCatAnims[idx] || new Animated.Value(1)).interpolate({
                              inputRange: [0, 1],
                              outputRange: [20, 0]
                            })
                          }]
                        }}
                      >
                        <CategoryCard
                          variant="hero"
                          name={cat.name}
                          count={cat.count}
                          imageUri={cat.imageUri}
                          style={{ width: categoryCardWidth }}
                          onPress={() => handleCategoryPress(cat)}
                        />
                      </Animated.View>
                    )}
                    ListFooterComponent={
                      hasMore ? (
                        <View style={styles.seeAllInRow}>
                          <SeeAllButton
                            label="See all"
                            onPress={() => navigation.navigate('Categories', { storeType: currentApiStoreType })}
                            accessibilityLabel="See all categories"
                          />
                        </View>
                      ) : null
                    }
                  />
                </View>
              );
            }

            if (section.sectionType === 'product_block' || section.sectionType === 'combo_block') {
              const isComboBlock = section.sectionType === 'combo_block';
              const normalizedItems = section.items.map(normalizeProductCached);
              // Unavailable items (shop closed or turned off) sink to the end of
              // the row — stable sort keeps the admin's arranged relative order
              // within each group. Recomputed every render, so the moment a live
              // availability/shop-status patch flips an item's flag, the row
              // reorders in the same tick the card greys out (or comes back to
              // the front the instant it's available again).
              const sortedItems = [...normalizedItems].sort((a, b) => {
                const aOut = !a.available || a.shopIsOpen === false || a.shop_is_open === false;
                const bOut = !b.available || b.shopIsOpen === false || b.shop_is_open === false;
                return aOut === bOut ? 0 : aOut ? 1 : -1;
              });
              const visibleItems = isComboBlock ? sortedItems.slice(0, 2) : sortedItems;
              // Show the "See all" button when EITHER:
              //   (a) admin enabled the explicit "show_see_all" flag, OR
              //   (b) the section has more items than are shown on the dashboard
              //       (API's `hasMore` is true when totalItems > items.length).
              // This respects the admin's intent even if max_visible_items
              // happens to match the total item count.
              const showSeeAll = section.showSeeAll === true;
              const hasMore = section.hasMore === true;
              const shouldShowSeeAll = showSeeAll || hasMore;
              // Horizontal-scroll cards: ~40% of content width so the next card
              // peeks (same peek effect as the categories rail).
              const productCardWidth = Math.floor(contentWidth * 0.4);
              return (
                <View key={section.id} style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <View style={styles.titleRow}>
                      <View style={styles.headerIndicator} />
                      {section.sectionIcon === 'box' && (
                        <HomeIcon name="box" size={14} color={colors.primary} style={styles.sectionTypeIcon} />
                      )}
                      {(section.sectionIcon === 'shoppingBag' || (!section.sectionIcon && section.sectionType === 'product_block')) && (
                        <HomeIcon name="shoppingBag" size={14} color={colors.primary} style={styles.sectionTypeIcon} />
                      )}
                      {(section.sectionIcon === 'star' || (!section.sectionIcon && isComboBlock)) && (
                        <HomeIcon name="star" size={14} color={colors.primary} fill={colors.primary} style={styles.sectionTypeIcon} />
                      )}
                      {section.sectionIcon && section.sectionIcon !== 'box' && section.sectionIcon !== 'shoppingBag' && section.sectionIcon !== 'star' && (
                        <HomeIcon name={section.sectionIcon} size={14} color={colors.primary} style={styles.sectionTypeIcon} />
                      )}
                      <Text style={styles.sectionTitlePremium}>{section.title}</Text>
                      {section.showHotBadge === true && (
                        <Animated.View style={[styles.hotBadge, { transform: [{ scale: hotBadgePulse }] }]}>
                          <LinearGradient
                            colors={['#FF6B6B', '#FF8E53']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.hotBadgeGradient}
                          >
                            <HomeIcon name="star" size={10} color="#FFFFFF" fill="#FFFFFF" style={styles.hotBadgeIcon} />
                            <Text style={styles.hotBadgeText}>HOT</Text>
                          </LinearGradient>
                        </Animated.View>
                      )}
                    </View>
                  </View>

                  <Animated.FlatList
                    data={visibleItems}
                    keyExtractor={(item) => String(item.id)}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.productScrollContent}
                    style={styles.productScroll}
                    keyboardShouldPersistTaps="handled"
                    initialNumToRender={4}
                    maxToRenderPerBatch={4}
                    windowSize={5}
                    renderItem={({ item, index: idx }) => {
                      const isItemCombo = isComboBlock || item.isCombo || item.is_combo;
                      return (
                        <HomeProductCard
                          item={item}
                          isItemCombo={isItemCombo}
                          quantity={isItemCombo ? getComboQuantity(item) : getProductQuantity(item.id)}
                          width={productCardWidth}
                          anim={staggerComboAnims[idx]}
                          onAdd={handleAddToCart}
                          onIncrement={handleIncrement}
                          onDecrement={handleDecrement}
                        />
                      );
                    }}
                    ListFooterComponent={
                      shouldShowSeeAll ? (
                        <View style={styles.seeAllInRowProduct}>
                          <SeeAllButton
                            label="See all"
                            onPress={() => navigation.navigate('ProductList', {
                              sectionSlug: section.slug,
                              sectionTitle: section.title,
                              storeType: currentApiStoreType,
                            })}
                            accessibilityLabel={`See all ${section.title}`}
                          />
                        </View>
                      ) : null
                    }
                  />
                </View>
              );
            }

            return null;
            });
          })()}
          {renderedSectionCount < totalDrawUnits ? (
            <View style={styles.section}>
              <SkeletonSectionTitle />
              <SkeletonRail
                count={3}
                width={homeSkeletonSizes(windowWidth).productWidth}
                height={homeSkeletonSizes(windowWidth).productHeight}
              />
            </View>
          ) : null}
          </Animated.View>
        </Animated.ScrollView>
          )}
        </>
      )}

      {/* Sticky Mini Cart — Home has the floating tab bar, so float above it.
          Hidden outside the delivery area — nothing here can be ordered. */}
      {insideDeliveryZone !== false && (
        <StickyMiniCart
          itemCount={cartItemCount}
          totalAmount={cartDisplayTotal}
          onPress={handleCartPress}
          aboveTabBar
        />
      )}
      <ReconnectingPill />

      <VariantSheet
        visible={!!variantSheetProduct}
        product={variantSheetProduct}
        onClose={() => setVariantSheetProduct(null)}
      />

      <ExitAppModal
        visible={isExitModalOpen}
        cartItemCount={cartItemCount}
        onStay={() => setIsExitModalOpen(false)}
        onExit={() => {
          setIsExitModalOpen(false);
          BackHandler.exitApp();
        }}
      />

      <ChangeLocationModal
        recentLocations={recentDeliveryLocations}
        onSelectRecent={(location) => handleConfirmPickedLocation(location.lat, location.lng)}
        visible={showLocationPicker}
        initialCenter={deliveryCoords ? { latitude: deliveryCoords.lat, longitude: deliveryCoords.lng } : undefined}
        onConfirm={handleConfirmPickedLocation}
        onClose={() => !savingLocation && setShowLocationPicker(false)}
      />
    </AppScreen>
  );
}

function HomeHeader({
  unreadCount,
  pulseAnim,
  onNotificationsPress,
  onCartPress,
  cartItemCount = 0,
  onSearchPress,
  onProductPress,
  onSearchOpenChange,
  dismissSignal,
  isLocationGated,
  cartItems = [],
  addItem,
  updateQuantity,
  removeItem,
  requireAuth,
  onOpenVariantSheet,
  deliveryCoords = null,
  onBarLayout,
  onDropdownHeight,
  isDarkGlass = false,
}) {
  const pulseOpacity = pulseAnim.interpolate({
    inputRange: [1, 1.45],
    outputRange: [0.55, 0],
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  // Idle typewriter placeholder: "Coca Cola" → erase → "Pizza" → …
  const [typedPlaceholder, setTypedPlaceholder] = useState('');
  const searchInputRef = useRef(null);
  const resultListRef = useRef(null);
  const debounceRef = useRef(null);
  const typewriterTimerRef = useRef(null);
  const dropdownAnim = useRef(new Animated.Value(0)).current;
  // Search bar motion: entrance, focus lift, idle icon pulse, go-chevron nudge
  const searchEnterAnim = useRef(new Animated.Value(0)).current;
  const searchFocusAnim = useRef(new Animated.Value(0)).current;
  const searchIconPulse = useRef(new Animated.Value(1)).current;
  const searchChevronNudge = useRef(new Animated.Value(0)).current;
  const caretBlinkAnim = useRef(new Animated.Value(1)).current;

  // Example names for the cycling typewriter (local-first food & drinks)
  const SEARCH_TYPE_EXAMPLES = useMemo(
    () => [
      'Coca Cola',
      'Pizza',
      'Burger',
      'Samosa',
      'Cold drinks',
      'Ice cream',
    ],
    []
  );

  // Entrance: fade + slide up + soft scale-in once on mount
  useEffect(() => {
    Animated.spring(searchEnterAnim, {
      toValue: 1,
      friction: 7,
      tension: 55,
      useNativeDriver: true,
    }).start();
  }, [searchEnterAnim]);

  // Focus: slight lift/scale when the field is active
  useEffect(() => {
    Animated.spring(searchFocusAnim, {
      toValue: isSearchOpen ? 1 : 0,
      friction: 8,
      tension: 120,
      useNativeDriver: true,
    }).start();
  }, [isSearchOpen, searchFocusAnim]);

  // Idle pulse on the saffron search icon (pauses while focused)
  useEffect(() => {
    if (isSearchOpen) {
      searchIconPulse.stopAnimation();
      Animated.spring(searchIconPulse, {
        toValue: 1,
        friction: 6,
        tension: 140,
        useNativeDriver: true,
      }).start();
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(searchIconPulse, {
          toValue: 1.1,
          duration: 1000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(searchIconPulse, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isSearchOpen, searchIconPulse]);

  // Soft left→right nudge on the go chevron while idle (no query)
  useEffect(() => {
    const hasQ = searchQuery.trim().length > 0;
    if (hasQ) {
      searchChevronNudge.stopAnimation();
      searchChevronNudge.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(searchChevronNudge, {
          toValue: 1,
          duration: 850,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(searchChevronNudge, {
          toValue: 0,
          duration: 850,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [searchQuery, searchChevronNudge]);

  // Typewriter placeholder: type → pause → backspace → next example.
  // Pauses while the user is focused or has typed a real query.
  useEffect(() => {
    const idle = !isSearchOpen && !searchQuery.trim();
    if (!idle) {
      if (typewriterTimerRef.current) {
        clearTimeout(typewriterTimerRef.current);
        typewriterTimerRef.current = null;
      }
      return undefined;
    }

    let wordIndex = 0;
    let charIndex = 0;
    let deleting = false;
    let cancelled = false;

    const TYPE_MS = 70;
    const DELETE_MS = 40;
    const HOLD_MS = 1400;
    const GAP_MS = 400;

    const tick = () => {
      if (cancelled) return;
      const word = SEARCH_TYPE_EXAMPLES[wordIndex % SEARCH_TYPE_EXAMPLES.length];

      if (!deleting) {
        charIndex += 1;
        setTypedPlaceholder(word.slice(0, charIndex));
        if (charIndex >= word.length) {
          deleting = true;
          typewriterTimerRef.current = setTimeout(tick, HOLD_MS);
          return;
        }
        typewriterTimerRef.current = setTimeout(tick, TYPE_MS);
        return;
      }

      charIndex -= 1;
      setTypedPlaceholder(word.slice(0, Math.max(0, charIndex)));
      if (charIndex <= 0) {
        deleting = false;
        wordIndex = (wordIndex + 1) % SEARCH_TYPE_EXAMPLES.length;
        typewriterTimerRef.current = setTimeout(tick, GAP_MS);
        return;
      }
      typewriterTimerRef.current = setTimeout(tick, DELETE_MS);
    };

    typewriterTimerRef.current = setTimeout(tick, 350);
    return () => {
      cancelled = true;
      if (typewriterTimerRef.current) {
        clearTimeout(typewriterTimerRef.current);
        typewriterTimerRef.current = null;
      }
    };
  }, [isSearchOpen, searchQuery, SEARCH_TYPE_EXAMPLES]);

  // Blinking caret next to the typed placeholder
  useEffect(() => {
    const idle = !isSearchOpen && !searchQuery.trim();
    if (!idle) {
      caretBlinkAnim.stopAnimation();
      caretBlinkAnim.setValue(1);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(caretBlinkAnim, {
          toValue: 0,
          duration: 420,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(caretBlinkAnim, {
          toValue: 1,
          duration: 420,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isSearchOpen, searchQuery, caretBlinkAnim]);

  const runSearch = useCallback(async (query) => {
    const trimmed = String(query || '').trim();
    // No location yet, or confirmed outside every zone — the catalog isn't
    // zone-scoped server-side, so hitting the endpoint here would show the
    // exact items ProductListScreen/CategoriesScreen refuse to show for the
    // same customer. Stay empty instead of leaking the full catalog.
    if (!trimmed || isLocationGated) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    try {
      const response = await productsApi.getProducts({
        search: trimmed,
        q: trimmed,
        // Asks for extra: unavailable items are dropped below, and the row
        // should still fill up to SEARCH_RESULT_LIMIT cards.
        limit: SEARCH_FETCH_LIMIT,
        include_closed_shops: 1,
        // Without a pin, resolveCustomerArea (server) falls back to the
        // default area for this route (no requireCustomer here to source
        // last_area_id from) — every customer would search the SAME area's
        // catalog regardless of where they actually are (multi-area audit
        // finding #4).
        latitude: deliveryCoords?.lat,
        longitude: deliveryCoords?.lng,
      });
      // Only what can be bought right now: in stock, shop open, inside its
      // time window.
      const items = asArray(response, ['products'])
        .map(normalizeProduct)
        .filter((p) => p.available && p.shopIsOpen !== false && p.inTimeWindow !== false)
        .slice(0, SEARCH_RESULT_LIMIT);
      setSearchResults(items);
    } catch (err) {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [isLocationGated, deliveryCoords]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!searchQuery.trim() || isLocationGated) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    debounceRef.current = setTimeout(() => {
      runSearch(searchQuery);
    }, 280);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery, runSearch, isLocationGated]);

  useEffect(() => {
    Animated.timing(dropdownAnim, {
      toValue: isSearchOpen ? 1 : 0,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [isSearchOpen, dropdownAnim]);

  // New results always start from the first card — the row keeps its sideways
  // scroll otherwise and the first card ends up cut off on the left.
  useEffect(() => {
    resultListRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [searchResults]);

  useEffect(() => {
    if (onSearchOpenChange) onSearchOpenChange(isSearchOpen && hasQuery);
  }, [isSearchOpen, hasQuery, onSearchOpenChange]);

  // External dismiss signal (e.g. backdrop tap in the parent)
  useEffect(() => {
    if (dismissSignal > 0) {
      setIsSearchOpen(false);
      searchInputRef.current?.blur();
      Keyboard.dismiss();
    }
  }, [dismissSignal]);

  const handleFocus = () => setIsSearchOpen(true);

  const focusInput = useCallback(() => {
    // If the input is already focused but the keyboard is hidden,
    // calling .focus() again is a no-op. Blur first, then re-focus
    // on the next frame so the keyboard reliably reopens.
    setTimeout(() => {
      if (searchInputRef.current?.isFocused()) {
        searchInputRef.current?.blur();
        setTimeout(() => {
          searchInputRef.current?.focus();
        }, 40);
      } else {
        searchInputRef.current?.focus();
      }
    }, 30);
  }, []);

  // If the user dismisses the keyboard via the system back button
  // or gesture, blur the input so the cursor stops blinking.
  // NOTE: do NOT close the dropdown here — the user may still want to
  // browse the results. The list only closes when they clear the text
  // (X button), tap a result, tap the backdrop, or tap "View all".
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidHide', () => {
      searchInputRef.current?.blur();
    });
    return () => sub.remove();
  }, []);

  const handleSubmit = () => {
    const q = searchQuery.trim();
    if (!q) return;
    setIsSearchOpen(false);
    searchInputRef.current?.blur();
    Keyboard.dismiss();
    onSearchPress(q);
  };

  const handleClear = () => {
    setSearchQuery('');
    setSearchResults([]);
    setIsSearchOpen(false);
    searchInputRef.current?.blur();
    Keyboard.dismiss();
  };

  const getProductQuantity = (productId) => {
    // Sum across all variants of this product (a multi-variant product can
    // have several separate cart lines — e.g. 2x Veg + 1x Chicken).
    return cartItems
      .filter((item) => String(item.product.id) === String(productId) && item.type !== 'combo')
      .reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  };

  const handleBuyPress = (product) => {
    if (!addItem) return;
    const doAdd = () => {
      if ((product.variants?.length ?? 0) > 1) {
        if (onOpenVariantSheet) onOpenVariantSheet(product);
        return;
      }
      addItem(product, 1, product.variants?.[0] ?? null);
    };
    if (requireAuth) {
      requireAuth(null, doAdd);
    } else {
      doAdd();
    }
  };

  // Reuse the variant already in the cart for this product — single-variant
  // products are stored WITH their variant attached, so incrementing without
  // it would miss the match and silently no-op instead of updating the line.
  const findCartVariant = (productId) => {
    const found = cartItems.find(
      (item) => String(item.product.id) === String(productId) && item.type !== 'combo'
    );
    return found?.variant?.id ?? null;
  };

  const handleIncrement = (product) => {
    if (!updateQuantity) return;
    const current = getProductQuantity(product.id);
    updateQuantity(product.id, current + 1, 'product', findCartVariant(product.id));
  };

  const handleDecrement = (product) => {
    if (!updateQuantity) return;
    const current = getProductQuantity(product.id);
    const variantId = findCartVariant(product.id);
    if (current <= 1 && removeItem) {
      removeItem(product.id, 'product', variantId);
    } else {
      updateQuantity(product.id, current - 1, 'product', variantId);
    }
  };

  const handleResultPress = (product) => {
    setIsSearchOpen(false);
    setSearchQuery('');
    setSearchResults([]);
    searchInputRef.current?.blur();
    Keyboard.dismiss();
    if (onProductPress) onProductPress(product);
  };

  const handleViewAll = () => {
    const q = searchQuery.trim();
    if (!q) return;
    setIsSearchOpen(false);
    searchInputRef.current?.blur();
    Keyboard.dismiss();
    onSearchPress(q);
  };

  const hasQuery = searchQuery.trim().length > 0;

  const searchBarMotionStyle = {
    opacity: searchEnterAnim,
    transform: [
      {
        translateY: searchEnterAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [16, 0],
        }),
      },
      {
        scale: Animated.multiply(
          searchEnterAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [0.94, 1],
          }),
          searchFocusAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [1, 1.02],
          })
        ),
      },
    ],
  };

  const searchIconMotionStyle = {
    transform: [{ scale: searchIconPulse }],
  };

  const searchChevronMotionStyle = {
    transform: [
      {
        translateX: searchChevronNudge.interpolate({
          inputRange: [0, 1],
          outputRange: [0, 4],
        }),
      },
    ],
  };

  // Frosted-glass search bar: light glass with dark text on the light bars
  // (day, rain), dark glass with white text on the night bar.
  const glassText = isDarkGlass ? '#FFFFFF' : colors.textPrimary;
  const glassMuted = isDarkGlass ? 'rgba(255, 255, 255, 0.72)' : colors.textSecondary;

  return (
    <View style={styles.homeHeader}>
      {/* Search bar — full-width, real TextInput with live results.
          Frosted glass pill: a real blur of the sky behind it, a light wash,
          a soft highlight along the top and a hairline edge. Single rounded
          shell so Android never paints square corners behind it. */}
      <Animated.View
        style={[
          styles.searchBarOuter,
          { borderColor: isDarkGlass ? 'rgba(255, 255, 255, 0.22)' : 'rgba(255, 255, 255, 0.75)' },
          searchBarMotionStyle,
        ]}
        // Bottom edge of the bar inside this header — the group's base height,
        // without any results dropdown under it.
        onLayout={(e) => onBarLayout?.(Math.round(e.nativeEvent.layout.y + e.nativeEvent.layout.height))}
      >
        <BlurView
          pointerEvents="none"
          intensity={40}
          tint={isDarkGlass ? 'dark' : 'light'}
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
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: isDarkGlass ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.3)' },
          ]}
        />
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(255, 255, 255, 0.5)', 'rgba(255, 255, 255, 0)']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <Pressable
          style={styles.searchBar}
          onPressIn={focusInput}
          android_disableSound
          accessibilityLabel="Search products"
        >
          <Animated.View style={[styles.searchIcon, searchIconMotionStyle]}>
            <HomeIcon name="search" size={20} color={glassMuted} />
          </Animated.View>
          <View style={styles.searchTextWrap}>
            <View style={styles.searchInputRow}>
              <TextInput
                ref={searchInputRef}
                style={[styles.searchInput, { color: glassText }]}
                value={searchQuery}
                onChangeText={setSearchQuery}
                onFocus={handleFocus}
                onSubmitEditing={handleSubmit}
                // Empty when idle so the typewriter overlay is visible;
                // static placeholder only while focused with no text.
                placeholder={
                  hasQuery || isSearchOpen ? 'Search items, food, snacks...' : ''
                }
                placeholderTextColor={glassMuted}
                selectionColor={colors.saffronDark}
                cursorColor={colors.saffronDark}
                returnKeyType="search"
                autoCorrect={false}
                autoCapitalize="none"
                accessibilityLabel="Search products"
                showSoftInputOnFocus
              />
              {!hasQuery && !isSearchOpen && (
                <View
                  pointerEvents="none"
                  style={styles.searchTypewriterOverlay}
                >
                  <Text style={[styles.searchTypewriterPrefix, { color: glassMuted }]} numberOfLines={1}>
                    Search{' '}
                  </Text>
                  <Text style={[styles.searchTypewriterText, { color: glassMuted }]} numberOfLines={1}>
                    {typedPlaceholder}
                  </Text>
                  <Animated.Text
                    style={[
                      styles.searchTypewriterCaret,
                      { color: glassMuted, opacity: caretBlinkAnim },
                    ]}
                  >
                    |
                  </Animated.Text>
                </View>
              )}
            </View>
            {hasQuery && (
              <Text pointerEvents="none" style={[styles.searchHint, { color: glassMuted }]} numberOfLines={1}>
                {isSearching
                  ? 'Searching...'
                  : searchResults.length > 0
                  ? `${searchResults.length} match${searchResults.length === 1 ? '' : 'es'} found`
                  : 'No matches yet'}
              </Text>
            )}
          </View>
          {hasQuery ? (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleClear}
              style={styles.searchClearButton}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              hitSlop={8}
            >
              <HomeIcon name="close" size={16} color={glassMuted} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleSubmit}
              style={styles.searchGoButton}
              accessibilityRole="button"
              accessibilityLabel="Search"
              hitSlop={8}
            >
              <Animated.View style={searchChevronMotionStyle}>
                <HomeIcon name="chevronRight" size={18} color={glassMuted} />
              </Animated.View>
            </TouchableOpacity>
          )}
        </Pressable>
      </Animated.View>

      {/* Live search results — cards sit directly under the search bar, no box behind them */}
      {isSearchOpen && hasQuery && (
        <View
          style={styles.searchDropdown}
          // Reported up so the page below moves down with the results.
          onLayout={(e) => onDropdownHeight?.(Math.round(e.nativeEvent.layout.height) + spacing.xs)}
        >
          {searchResults.length > 0 && (
            <FlatList
              ref={resultListRef}
              data={searchResults}
              horizontal
              keyExtractor={(item, idx) => `sr-${item.id || idx}`}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
              showsHorizontalScrollIndicator={false}
              style={styles.searchResultList}
              contentContainerStyle={styles.searchResultListContent}
              ListFooterComponent={(
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={handleViewAll}
                  style={styles.searchSeeAllCard}
                  accessibilityRole="button"
                  accessibilityLabel="See all search results"
                >
                  <LinearGradient
                    colors={[colors.saffron, colors.saffronDark]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.searchSeeAllIcon}
                  >
                    <HomeIcon name="chevronRight" size={18} color="#FFFFFF" />
                  </LinearGradient>
                  <Text style={styles.searchSeeAllText}>See all</Text>
                </TouchableOpacity>
              )}
              renderItem={({ item }) => {
                const qty = getProductQuantity(item.id);
                const isMultiVariant = (item.variants?.length ?? 0) > 1;
                return (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={styles.searchResultCard}
                    onPress={() => handleResultPress(item)}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${item.name}`}
                  >
                    <View style={styles.searchResultImageWrap}>
                      {item.imageUrl ? (
                        <ExpoImage
                          source={{ uri: item.imageUrl }}
                          style={styles.searchResultImage}
                          contentFit="cover"
                          transition={120}
                          priority="low"
                        />
                      ) : (
                        <View style={[styles.searchResultImage, styles.searchResultImageFallback]}>
                          <HomeIcon name="box" size={26} color={colors.textTertiary || '#9AA1AB'} />
                        </View>
                      )}
                    </View>
                    <Text style={styles.searchResultName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.searchResultPriceText} numberOfLines={1}>
                      {formatRupee(item.price)}
                    </Text>
                    {qty > 0 && !isMultiVariant ? (
                      <View style={styles.searchResultStepper}>
                        <TouchableOpacity
                          activeOpacity={0.7}
                          onPress={(e) => {
                            e.stopPropagation?.();
                            handleDecrement(item);
                          }}
                          style={styles.searchResultStepBtn}
                          accessibilityRole="button"
                          accessibilityLabel="Decrease quantity"
                          hitSlop={6}
                        >
                          <HomeIcon name="minus" size={12} color="#FFFFFF" />
                        </TouchableOpacity>
                        <Text style={styles.searchResultStepQty}>{qty}</Text>
                        <TouchableOpacity
                          activeOpacity={0.7}
                          onPress={(e) => {
                            e.stopPropagation?.();
                            handleIncrement(item);
                          }}
                          style={styles.searchResultStepBtn}
                          accessibilityRole="button"
                          accessibilityLabel="Increase quantity"
                          hitSlop={6}
                        >
                          <HomeIcon name="add" size={12} color="#FFFFFF" />
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={(e) => {
                          e.stopPropagation?.();
                          handleBuyPress(item);
                        }}
                        style={styles.searchResultBuyBtn}
                        accessibilityRole="button"
                        accessibilityLabel={
                          qty > 0
                            ? `${qty} in cart. Tap to change ${item.name} options`
                            : isMultiVariant ? `Select ${item.name} options` : `Buy ${item.name}`
                        }
                        hitSlop={6}
                      >
                        <LinearGradient
                          colors={[colors.saffron, colors.saffronDark]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={styles.searchResultBuyGradient}
                        >
                          <Text style={styles.searchResultBuyText}>
                            {qty > 0 ? `${qty} in cart` : isMultiVariant ? 'Select' : 'Buy'}
                          </Text>
                        </LinearGradient>
                      </TouchableOpacity>
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          )}
          {!isSearching && searchResults.length === 0 && (
            <View style={styles.searchEmptyState}>
              <View style={styles.searchEmptyIcon}>
                <HomeIcon name="search" size={22} color={colors.saffronDark} />
              </View>
              <Text style={styles.searchEmptyTitle}>No matching items</Text>
              <Text style={styles.searchEmptyHint}>
                Try different keywords or browse categories below.
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function formatRupee(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `₹${Math.round(n)}`;
}

function OfferBannerCarousel({ offers = [], bannerWidth, onOfferPress }) {
  const listRef = useRef(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const sweepAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0.18)).current;
  // Which banner is showing. A ref, not state: the dots read the scroll position
  // directly, so nothing needs to redraw when it changes.
  const activeIndexRef = useRef(0);
  const [imageErrors, setImageErrors] = useState({});
  const isUserScrolling = useRef(false);

  const visibleOffers = offers.filter(offer => {
    const imageUri = normalizeImageUrl(offer?.imageUrl || offer?.image_url || offer?.imageUri);
    return Boolean(imageUri);
  });

  // Shimmer sweep across the banner — paused while user is interacting
  useEffect(() => {
    if (isUserScrolling.current) return undefined;
    const animation = Animated.loop(
      Animated.timing(sweepAnim, {
        toValue: 1,
        duration: 2400,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      })
    );
    animation.start();
    return () => animation.stop();
  }, [sweepAnim]);

  // Soft pulsing saffron glow under the banner
  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 0.32,
          duration: 1600,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0.18,
          duration: 1600,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [glowAnim]);

  // Auto-advance every 4.5s, pause briefly when user takes over
  useEffect(() => {
    if (visibleOffers.length <= 1) return undefined;
    const interval = setInterval(() => {
      if (isUserScrolling.current) return;
      const nextIndex = (activeIndexRef.current + 1) % visibleOffers.length;
      activeIndexRef.current = nextIndex;
      // Back to the first banner is a plain cut. Animating it would whip the
      // strip past every banner (and every dot) in a fraction of a second.
      listRef.current?.scrollToIndex({ index: nextIndex, animated: nextIndex !== 0 });
    }, 4500);
    return () => clearInterval(interval);
  }, [visibleOffers.length]);

  useEffect(() => {
    if (activeIndexRef.current >= visibleOffers.length) {
      activeIndexRef.current = 0;
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
    }
  }, [visibleOffers.length]);

  if (visibleOffers.length === 0) return null;

  // 8:16 ratio (1:2) — shorter, more compact banner
  const bannerHeight = Math.round((bannerWidth * 8) / 16);

  const handleMomentumEnd = (event) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const nextIndex = Math.round(offsetX / bannerWidth);
    activeIndexRef.current = Math.max(0, Math.min(nextIndex, visibleOffers.length - 1));
    isUserScrolling.current = false;
  };

  const handleScrollBegin = () => {
    isUserScrolling.current = true;
  };

  const handleTap = (offer) => {
    // Press feedback
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 0.85, duration: 80, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 140, useNativeDriver: true }),
    ]).start();
    onOfferPress?.(offer);
  };

  const sweepTranslateX = sweepAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-bannerWidth * 1.4, bannerWidth * 1.4],
  });

  return (
    <View style={styles.offerCarouselSection}>
      {/* One rounded window over the whole strip: while a banner slides in, the
          list's own edges would cut the pictures with square corners. */}
      <View style={[styles.offerCarouselClip, { width: bannerWidth }]}>
      <Animated.FlatList
        ref={listRef}
        data={visibleOffers}
        keyExtractor={(offer, index) => String(offer.id || index)}
        horizontal
        showsHorizontalScrollIndicator={false}
        bounces={false}
        snapToInterval={bannerWidth}
        snapToAlignment="start"
        disableIntervalMomentum
        decelerationRate="fast"
        onMomentumScrollEnd={handleMomentumEnd}
        onScrollBeginDrag={handleScrollBegin}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: true }
        )}
        scrollEventThrottle={16}
        getItemLayout={(_, index) => ({
          length: bannerWidth,
          offset: bannerWidth * index,
          index,
        })}
        style={{ width: bannerWidth }}
        renderItem={({ item: offer }) => {
          const imageUri = normalizeImageUrl(offer.imageUrl || offer.image_url || offer.imageUri);
          const offerKey = String(offer.id || imageUri);
          const isClickable = offer.isClickable || offer.is_clickable;
          const hasImageError = Boolean(imageErrors[offerKey]);

          const inner = (
            <Animated.View
              style={[
                styles.offerBanner,
                {
                  width: bannerWidth,
                  height: bannerHeight,
                  opacity: fadeAnim,
                },
              ]}
            >
              {/* Shimmer sweep across the banner */}
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.offerBannerSweep,
                  {
                    transform: [
                      { translateX: sweepTranslateX },
                      { rotate: '-18deg' },
                    ],
                  },
                ]}
              />

              {hasImageError ? (
                <View style={[styles.offerBannerFallback, { height: bannerHeight }]}>
                  <Text style={styles.offerBannerFallbackText}>Banner image unavailable</Text>
                </View>
              ) : (
                <RetryingImage
                  uri={imageUri}
                  style={styles.offerBannerImage}
                  contentFit="cover"
                  transition={200}
                  priority="high"
                  onGiveUp={() => setImageErrors(prev => ({ ...prev, [offerKey]: true }))}
                />
              )}

              {/* Subtle bottom gradient for any future text overlay */}
              <LinearGradient
                colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.18)']}
                start={{ x: 0, y: 0.55 }}
                end={{ x: 0, y: 1 }}
                style={StyleSheet.absoluteFillObject}
                pointerEvents="none"
              />
            </Animated.View>
          );

          return (
            <View style={{ width: bannerWidth }}>
              {isClickable ? (
                <TouchableOpacity
                  activeOpacity={1}
                  onPress={() => handleTap(offer)}
                  accessibilityRole="button"
                  accessibilityLabel={offer.title || 'Offer banner'}
                >
                  {inner}
                </TouchableOpacity>
              ) : (
                inner
              )}
            </View>
          );
        }}
      />
      </View>

      {visibleOffers.length > 1 && (
        <View style={styles.offerDots}>
          {visibleOffers.map((offer, index) => {
            const inputRange = [
              (index - 1) * bannerWidth,
              index * bannerWidth,
              (index + 1) * bannerWidth,
            ];
            const dotScaleX = scrollX.interpolate({
              inputRange,
              outputRange: [6 / 22, 1, 6 / 22],
              extrapolate: 'clamp',
            });
            const opacity = scrollX.interpolate({
              inputRange,
              outputRange: [0.35, 1, 0.35],
              extrapolate: 'clamp',
            });

            return (
              <Animated.View
                key={offer.id || index}
                style={[
                  styles.offerDot,
                  {
                    transform: [{ scaleX: dotScaleX }],
                    opacity,
                  },
                ]}
              />
            );
          })}
        </View>
      )}
    </View>
  );
}

function SeeAllButton({ label = 'See all', onPress, accessibilityLabel }) {
  const pressAnim = useRef(new Animated.Value(0)).current;
  const chevronAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Idle: chevron nudges back and forth to invite a tap
    const idle = Animated.loop(
      Animated.sequence([
        Animated.timing(chevronAnim, {
          toValue: 1,
          duration: 1100,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(chevronAnim, {
          toValue: 0,
          duration: 1100,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
      ])
    );
    idle.start();
    return () => idle.stop();
  }, [chevronAnim]);

  const handleIn = () => {
    Animated.spring(pressAnim, {
      toValue: 1,
      friction: 6,
      tension: 160,
      useNativeDriver: true,
    }).start();
    Animated.spring(chevronAnim, {
      toValue: 2,
      friction: 5,
      tension: 180,
      useNativeDriver: true,
    }).start();
  };
  const handleOut = () => {
    Animated.spring(pressAnim, {
      toValue: 0,
      friction: 6,
      tension: 160,
      useNativeDriver: true,
    }).start();
    Animated.spring(chevronAnim, {
      toValue: 0,
      friction: 6,
      tension: 160,
      useNativeDriver: true,
    }).start();
  };

  return (
    <PressableScale
      onPress={onPress}
      onPressIn={handleIn}
      onPressOut={handleOut}
      style={styles.seeAllBtn}
      scaleTo={0.94}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
    >
      <Text style={styles.seeAllText} numberOfLines={1}>
        {label}
      </Text>
      <Animated.View
        style={[
          styles.seeAllChevronWrap,
          {
            transform: [
              {
                translateX: chevronAnim.interpolate({
                  inputRange: [0, 1, 2],
                  outputRange: [0, 3, 6],
                }),
              },
            ],
          },
        ]}
      >
        <View style={styles.seeAllChevron}>
          <HomeIcon name="chevronRight" size={11} color={colors.saffronDark} strokeWidth={2.6} />
        </View>
      </Animated.View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgSurface,
  },
  scrollContent: {
    paddingBottom: layout.stickyCartScrollPadding,
  },
  // No padding of its own — the rows inside use the same gutter as the real page.
  skeletonContainer: {
    flex: 1,
  },
  // The base notice style pulls up by a margin meant for the old layout.
  skeletonNotice: {
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    marginLeft: 0,
  },
  skeletonRail: {
    flexDirection: 'row',
    paddingHorizontal: PAGE_GUTTER,
    overflow: 'hidden',
  },
  // Stands in for the shop-mode circles (same top offset and centring).
  skeletonModeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.lg,
    height: 100,
    paddingTop: spacing.sm,
  },
  locationLoadingNotice: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: -spacing.lg,
    marginBottom: spacing.lg,
  },
  // One light-sky-blue-to-white group holds the location row, search bar and the
  // closed-shop notice; the search dropdown hangs below it, so it stays on top.
  topGroup: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
  },
  topSolid: {
    zIndex: 1, // keeps the search dropdown drawn over the fade below
  },
  topBarDecor: {
    ...StyleSheet.absoluteFillObject,
  },
  topFade: {
    paddingBottom: spacing.xxl,
  },
  homeHeader: {
    paddingHorizontal: PAGE_GUTTER,
    zIndex: 20,
  },
  homeHeaderCard: {
    backgroundColor: colors.bgSurface,
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.saffronDark,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 6,
  },
  // Location on the left, notification and profile buttons on the right.
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: PAGE_GUTTER,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
    minHeight: 36 + spacing.xs + spacing.sm,
  },
  topRowLocation: {
    flex: 1,
  },
  locationBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  locationBarBody: {
    flex: 1,
  },
  // Black text with a white halo around the letters — reads on the sky blue
  // and the sun's beams without a box behind it.
  locationBarText: {
    fontSize: fontSizes.xxl,
    lineHeight: fontSizes.xxl * lineHeights.normal,
    fontWeight: '700',
    color: '#111827',
    textShadowColor: '#FFFFFF',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
  },
  locationBarAddress: {
    fontSize: fontSizes.xs,
    lineHeight: fontSizes.xs * lineHeights.normal,
    fontWeight: '600',
    color: '#111827',
    textShadowColor: '#FFFFFF',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 5,
  },
  // On the light-black night bar: white text, a soft dark shadow instead of the halo.
  barTextNight: {
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  locationBarLine: {
    height: 2,
    borderRadius: 1,
    marginTop: spacing.xs,
  },
  homeHeaderInner: {
    paddingHorizontal: PAGE_GUTTER,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  homeHeaderTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandChipCompact: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandLogo: {
    width: 130,
    height: 38,
  },

  headerRightCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginLeft: 'auto',
  },
  headerIconButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: '#111827',
    position: 'relative',
  },

  headerBadgePulse: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.saffron,
  },
  headerBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.saffron,
    borderWidth: 2,
    borderColor: colors.bgSurface,
  },
  headerBadgeText: {
    color: colors.textInverse,
    fontSize: 10,
    fontWeight: '800',
  },
  searchBarOuter: {
    marginTop: spacing.sm,
    marginHorizontal: 0, // full width — escapes the card padding
    borderRadius: 24,
    // See-through: the blur and wash are layered inside (see HomeHeader).
    // Matching radius + overflow hidden so Android draws fully rounded
    // corners. Hairline border (colour set inline per scene), no shadow.
    backgroundColor: 'transparent',
    borderWidth: 1,
    overflow: 'hidden',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    height: 48,
    paddingHorizontal: spacing.md,
  },
  searchIcon: {
    marginRight: spacing.sm,
  },
  searchTextWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  searchInputRow: {
    position: 'relative',
    justifyContent: 'center',
    minHeight: 22,
  },
  searchInput: {
    ...typography.body,
    color: colors.textPrimary,
    fontSize: 14.5,
    fontWeight: '500',
    padding: 0,
  },
  searchTypewriterOverlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 4,
  },
  searchTypewriterPrefix: {
    ...typography.body,
    fontSize: 14.5,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  searchTypewriterText: {
    ...typography.body,
    fontSize: 14.5,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  searchTypewriterCaret: {
    fontSize: 15,
    fontWeight: '400',
    color: colors.textSecondary,
    marginLeft: 1,
    marginTop: -1,
  },
  searchHint: {
    ...typography.caption,
    color: colors.textTertiary || colors.textSecondary,
    fontSize: 11,
    fontWeight: '500',
  },
  searchGoButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.xs,
  },
  searchClearButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.xs,
  },
  searchBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(8, 12, 20, 0.45)',
    zIndex: 5,
  },
  // No box, border or shadow — the result cards sit straight on the light sky blue.
  // Negative margin lets the row scroll edge to edge past the header padding.
  searchDropdown: {
    marginHorizontal: -PAGE_GUTTER,
    marginTop: spacing.xs,
  },
  searchResultCard: {
    width: 96,
    padding: 6,
    gap: 3,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgSurface,
  },
  searchResultImageWrap: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: colors.surfaceMuted,
  },
  searchResultImage: {
    width: '100%',
    height: '100%',
  },
  searchResultImageFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchResultName: {
    ...typography.body,
    fontSize: 11,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  searchResultPriceText: {
    ...typography.body,
    fontSize: 12,
    fontWeight: '800',
    color: colors.saffronDark,
  },
  searchResultBuyBtn: {
    alignSelf: 'stretch',
    borderRadius: 16,
    overflow: 'hidden',
  },
  searchResultBuyGradient: {
    paddingHorizontal: 6,
    paddingVertical: 5,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchResultBuyText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  searchResultStepper: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.saffronDark,
    borderRadius: 16,
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  searchResultStepBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchResultStepQty: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    minWidth: 12,
    textAlign: 'center',
  },
  searchResultList: {
    flexGrow: 0,
  },
  searchResultListContent: {
    paddingHorizontal: PAGE_GUTTER,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  searchSeeAllCard: {
    flex: 1, // fills the footer wrapper, which the row stretches to card height
    width: 72,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgSurface,
  },
  searchSeeAllIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchSeeAllText: {
    ...typography.body,
    fontSize: 11.5,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  searchEmptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    gap: 6,
  },
  searchEmptyIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.saffronLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  searchEmptyTitle: {
    ...typography.body,
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  searchEmptyHint: {
    ...typography.caption,
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  // Red pill, centered under the search bar.
  closedBanner: {
    alignSelf: 'center',
    marginTop: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closedText: {
    ...typography.caption,
    color: colors.textInverse,
    fontWeight: '700',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  homeErrorCard: {
    marginHorizontal: PAGE_GUTTER,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.error || '#FF4B4B',
    backgroundColor: colors.bgCard,
    gap: spacing.sm,
  },
  homeErrorText: {
    ...typography.bodySmall,
    color: colors.textPrimary,
  },
  toggleContainer: {
    marginHorizontal: PAGE_GUTTER,
    marginTop: 0,
    marginBottom: -spacing.sm,
  },
  // Shop modes sit straight on the page: no card background, border or shadow.
  toggleCardBare: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    shadowOpacity: 0,
    elevation: 0,
    paddingTop: spacing.sm,
    paddingBottom: 0,
  },
  offerCarouselSection: {
    marginTop: spacing.md,
    paddingHorizontal: PAGE_GUTTER,
  },
  // The rounded corners live on this clip, not on each banner, so they stay
  // round while banners slide past each other.
  offerCarouselClip: {
    borderRadius: 18,
    overflow: 'hidden',
  },
  offerBanner: {
    overflow: 'hidden',
    position: 'relative',
  },
  offerBannerImage: {
    width: '100%',
    height: '100%',
  },
  offerBannerSweep: {
    position: 'absolute',
    top: -80,
    bottom: -80,
    width: 60,
    backgroundColor: 'rgba(255,255,255,0.55)',
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 14,
  },
  offerBannerAccent: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
    backgroundColor: colors.saffron,
  },
  offerBannerFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: PAGE_GUTTER,
    backgroundColor: colors.surfaceMuted,
  },
  offerBannerFallbackText: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  offerDots: {
    marginTop: spacing.sm,
    minHeight: 8,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 5,
  },
  offerDot: {
    width: 22,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.saffronDark,
  },
  section: {
    marginTop: spacing.md,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginHorizontal: PAGE_GUTTER,
    marginBottom: spacing.md,
  },
  sectionHeader: {
    marginHorizontal: PAGE_GUTTER,
    marginBottom: spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  headerIndicator: {
    width: 4,
    height: 18,
    backgroundColor: colors.primary,
    borderRadius: radius.xs,
  },
  sectionTypeIcon: {
    marginRight: 2,
  },
  sectionTitlePremium: {
    ...typography.h3,
    color: colors.textPrimary,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  hotBadge: {
    borderRadius: radius.md,
    marginLeft: spacing.xs,
    overflow: 'hidden',
  },
  hotBadgeGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  hotBadgeIcon: {
    marginTop: 0,
  },
  hotBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  sectionSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
    marginLeft: 8,
  },
  categoryScroll: {
    // FlatList in horizontal mode
  },
  categoryScrollContent: {
    paddingHorizontal: PAGE_GUTTER,
    paddingRight: PAGE_GUTTER + spacing.lg, // extra right padding so last card has breathing room
    alignItems: 'center',
  },
  seeAllInRow: {
    justifyContent: 'center',
    paddingLeft: PAGE_GUTTER,
  },
  seeAllInRowProduct: {
    justifyContent: 'center',
    paddingLeft: PAGE_GUTTER,
    alignSelf: 'center',
  },
  seeAllEndRow: {
    alignItems: 'flex-end',
    paddingTop: spacing.md,
  },
  productScroll: {
    // FlatList in horizontal mode
  },
  productScrollContent: {
    paddingHorizontal: PAGE_GUTTER,
    paddingRight: PAGE_GUTTER + spacing.lg, // extra right padding so the See all pill has breathing room
    alignItems: 'center',
  },
  comboGrid: {
    paddingHorizontal: PAGE_GUTTER,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  comboGridFeatured: {
    alignItems: 'stretch',
  },
  sectionHeaderTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  seeAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingLeft: 10,
    paddingRight: 4,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.saffron,
    shadowColor: colors.saffronDark,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 6,
    elevation: 3,
  },
  seeAllText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.bgSurface,
    letterSpacing: 0.3,
  },
  seeAllChevronWrap: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.22)',
    overflow: 'hidden',
  },
  seeAllChevron: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgSurface,
  },
});
