import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Animated,
  TouchableOpacity,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import {
  AppScreen,
  AppHeader,
  AppIcon,
  ProductImage,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  QuantityStepper,
  PressableScale,
} from '../../../components';
import { colors, typography, spacing, radius, shadows, layout, borderWidth, motionConfig, entryDistance, easing, smallMs, staggerMs, screenMs } from '../../../theme';
import { useCartStore, useSettingsStore } from '../../../stores';
import { cartApi } from '../../../api';
import { buildProgressHintText, normalizeCartCalculation, useReducedMotion } from '../../../utils';
import CouponSheet from './CouponSheet';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const getItemType = (item) =>
  item.type || (item.product?.isCombo || item.product?.is_combo ? 'combo' : 'product');
const getItemKey = (item) => `${getItemType(item)}-${item.product.id}`;

export default function CartScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const items = useCartStore(state => state.items);
  const updateQuantity = useCartStore(state => state.updateQuantity);
  const removeItem = useCartStore(state => state.removeItem);
  const clearCart = useCartStore(state => state.clearCart);
  const appliedCouponCode = useCartStore(state => state.appliedCouponCode);
  const appliedCouponId = useCartStore(state => state.appliedCouponId);
  const appliedCoupon = useCartStore(state => state.appliedCoupon);
  const couponAutoApplyDisabled = useCartStore(state => state.couponAutoApplyDisabled);
  const setAppliedCoupon = useCartStore(state => state.setAppliedCoupon);
  const clearAppliedCoupon = useCartStore(state => state.clearAppliedCoupon);
  const setFreeDeliveryProgress = useCartStore(state => state.setFreeDeliveryProgress);
  const shopStatus = useSettingsStore(state => state.shopStatus);

  const [isCalculating, setIsCalculating] = useState(false);
  const [bill, setBill] = useState(null);
  const [calcError, setCalcError] = useState(null);
  const [showCouponSheet, setShowCouponSheet] = useState(false);

  const reducedMotion = useReducedMotion();

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const listOpacity = useRef(new Animated.Value(1)).current;
  const arrowAnim = useRef(new Animated.Value(0)).current;
  const offerHintAnim = useRef(new Animated.Value(0)).current;
  const lastOfferHintKey = useRef(null);
  const freeDeliveryAnim = useRef(new Animated.Value(0)).current;
  const nearestOfferAnim = useRef(new Animated.Value(0)).current;

  // Coupon card animations
  const couponEntranceAnim = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;
  const couponContentOpacity = useRef(new Animated.Value(1)).current;
  const couponCheckScale = useRef(new Animated.Value(1)).current;
  const couponErrorShake = useRef(new Animated.Value(0)).current;
  const couponChevronNudge = useRef(new Animated.Value(0)).current;
  const prevCouponStateRef = useRef(undefined);
  const couponStateAnimRef = useRef(null);
  const validItems = useMemo(
    () => items.filter(item => item?.product?.id),
    [items],
  );

  // Cart-item entrance stagger: only the items present at mount animate in
  // with a per-index delay; items encountered later render fully visible.
  const initialItemKeysRef = useRef(null);
  if (initialItemKeysRef.current === null) {
    initialItemKeysRef.current = new Set(validItems.map(getItemKey));
  }
  const itemAnimsRef = useRef(new Map());
  const getItemAnim = (key) => {
    let anim = itemAnimsRef.current.get(key);
    if (!anim) {
      const isInitial = initialItemKeysRef.current.has(key);
      anim = new Animated.Value(isInitial && !reducedMotion ? 0 : 1);
      itemAnimsRef.current.set(key, anim);
    }
    return anim;
  };

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, [fadeAnim]);

  useEffect(() => {
    if (reducedMotion) return undefined;
    const keys = Array.from(initialItemKeysRef.current);
    if (keys.length === 0) return undefined;
    const animations = keys.map((key, index) =>
      Animated.timing(getItemAnim(key), {
        toValue: 1,
        duration: screenMs,
        delay: index * staggerMs,
        easing,
        useNativeDriver: true,
      }),
    );
    const composite = Animated.parallel(animations);
    composite.start();
    return () => composite.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const arrowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(arrowAnim, {
          toValue: 4,
          duration: 650,
          useNativeDriver: true,
        }),
        Animated.timing(arrowAnim, {
          toValue: 0,
          duration: 650,
          useNativeDriver: true,
        }),
      ])
    );
    arrowLoop.start();

    return () => {
      arrowLoop.stop();
    };
  }, [arrowAnim]);

  // Bill calculations are async and can resolve out of order (e.g. an
  // auto-apply confirmation request that was already in flight when the
  // user tapped "remove" can resolve AFTER the removal request and
  // silently re-apply the coupon it was confirming). This sequence guard
  // makes sure only the response to the MOST RECENT request is ever
  // applied to state — any earlier, now-stale response is dropped.
  const billRequestSeqRef = useRef(0);

  const calculateBill = async () => {
    const seq = ++billRequestSeqRef.current;

    if (validItems.length === 0) {
      setBill(null);
      return;
    }

    setIsCalculating(true);
    setCalcError(null);

    Animated.timing(listOpacity, { toValue: 0.5, duration: 100, useNativeDriver: true }).start();

    try {
      const payload = {
        items: validItems.map(item => ({
          productId: item.product.id,
          quantity: item.quantity,
          type: item.type || (item.product?.isCombo || item.product?.is_combo ? 'combo' : 'product'),
          isCombo: (item.type || (item.product?.isCombo || item.product?.is_combo ? 'combo' : 'product')) === 'combo',
        })),
        coupon_code: appliedCouponCode || undefined,
        // Identifies a specific tapped offer that has no code of its own
        // (auto-apply-only coupons can have a null code) — lets the backend
        // force-apply that exact offer instead of falling back to "the best
        // available one", which would silently override the user's tap.
        coupon_id: !appliedCouponCode && appliedCouponId ? appliedCouponId : undefined,
        // Tells the backend not to silently auto-apply the next-best offer
        // when no code is present — set once the user explicitly removes
        // their coupon, so "remove" actually zeroes out the discount.
        no_auto_apply: couponAutoApplyDisabled,
      };
      const calculatedBill = normalizeCartCalculation(await cartApi.calculate(payload));
      if (seq !== billRequestSeqRef.current) return; // a newer request superseded this one
      setBill(calculatedBill);
      setFreeDeliveryProgress(calculatedBill.freeDeliveryProgress);
      // Sync applied coupon from the bill response (handles auto-apply + validation).
      if (calculatedBill.appliedCoupon) {
        setAppliedCoupon(calculatedBill.appliedCoupon.code, calculatedBill.appliedCoupon);
      } else if (calculatedBill.couponError && appliedCouponCode) {
        // The user-entered code failed validation — clear it.
        clearAppliedCoupon();
      }
      Animated.timing(listOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    } catch (err) {
      if (seq !== billRequestSeqRef.current) return;
      setCalcError(err.message || 'Failed to calculate bill');
      Animated.timing(listOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    } finally {
      if (seq === billRequestSeqRef.current) setIsCalculating(false);
    }
  };

  useEffect(() => {
    // Debounce bill recalculation to avoid rapid successive API calls
    const timer = setTimeout(() => {
      calculateBill();
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, appliedCouponCode, appliedCouponId, couponAutoApplyDisabled]);

  const handleRemove = (id, type = 'product') => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    removeItem(id, type);
  };

  const handleClear = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    clearCart();
  };

  const handleCheckout = () => {
    navigation.navigate('Checkout');
  };

  const handleApplyCoupon = (code, coupon) => {
    setAppliedCoupon(code, coupon);
  };

  const handleRemoveCoupon = () => {
    clearAppliedCoupon();
  };

  const renderEmptyState = () => (
    <EmptyState
      icon={<AppIcon name="cart" size={56} color={colors.textTertiary} />}
      title="Your cart is empty"
      subtitle="Looks like you haven't added anything to your cart yet."
      actionLabel="Start Shopping"
      onAction={() => navigation.navigate('MainTabs', { screen: 'Home' })}
      style={styles.emptyState}
    />
  );

  const isCheckoutDisabled =
    validItems.length === 0 ||
    isCalculating ||
    calcError ||
    shopStatus === 'closed' ||
    !bill;

  const bottomBarHeight = 78 + insets.bottom;
  const checkoutBtnText = bill ? `Proceed to Pay  •  ₹${bill.grandTotal}` : 'Checkout';

  const freeDeliveryProgress = bill?.freeDeliveryProgress || null;
  const freeDeliveryPercent = useMemo(() => {
    if (!freeDeliveryProgress || !freeDeliveryProgress.minOrder) return 0;
    const subtotal = bill?.subtotal || 0;
    const minOrder = freeDeliveryProgress.minOrder;
    return Math.min(100, Math.max(0, (subtotal / minOrder) * 100));
  }, [freeDeliveryProgress, bill?.subtotal]);

  const couponHasOffers = (bill?.availableCoupons || []).length > 0;
  const couponState = appliedCoupon
    ? 'available'
    : bill?.couponError
    ? 'error'
    : couponHasOffers
    ? 'available'
    : 'empty';

  // Top 2 unlocked offers (highest discount first) shown inline on the cart,
  // with a "Show more" button to open the full CouponSheet. The applied
  // coupon is excluded here — it's no longer "available to pick", it's
  // already active — and rendered separately via its own applied row.
  const pickableOffers = useMemo(() => {
    const unlocked = (bill?.availableCoupons || []).filter(
      coupon => coupon.unlocked !== false && coupon.eligible !== false && coupon.isEligible !== false
        && !(appliedCoupon && coupon.id === appliedCoupon.id),
    );
    return unlocked
      .slice()
      .sort((a, b) => Number(b.discount || 0) - Number(a.discount || 0));
  }, [bill?.availableCoupons, appliedCoupon]);
  const topOffers = useMemo(() => pickableOffers.slice(0, 2), [pickableOffers]);

  const formatOfferBadge = (coupon) => {
    if (!coupon) return null;
    if (Number(coupon.discount) > 0) return `Save ₹${coupon.discount}`;
    if (coupon.discountType === 'free_delivery') return 'Free delivery';
    if (coupon.discountType === 'percent') return `${coupon.discountValue}% off`;
    if (coupon.discountType === 'flat') return `₹${coupon.discountValue} off`;
    return null;
  };

  const nearestOfferProgress = bill?.nearestOfferProgress || null;
  const nearestOfferPercent = useMemo(() => {
    if (!nearestOfferProgress || !nearestOfferProgress.minOrder) return 0;
    const subtotal = bill?.subtotal || 0;
    const minOrder = nearestOfferProgress.minOrder;
    return Math.min(100, Math.max(0, (subtotal / minOrder) * 100));
  }, [nearestOfferProgress, bill?.subtotal]);

  // Animate the free-delivery / nearest-offer progress bars smoothly whenever
  // the underlying percentage changes, instead of snapping to the new width.
  useEffect(() => {
    Animated.timing(freeDeliveryAnim, {
      toValue: freeDeliveryPercent,
      duration: reducedMotion ? 0 : motionConfig.screen.duration,
      easing,
      useNativeDriver: false,
    }).start();
  }, [freeDeliveryPercent, freeDeliveryAnim, reducedMotion]);

  useEffect(() => {
    Animated.timing(nearestOfferAnim, {
      toValue: nearestOfferPercent,
      duration: reducedMotion ? 0 : motionConfig.screen.duration,
      easing,
      useNativeDriver: false,
    }).start();
  }, [nearestOfferPercent, nearestOfferAnim, reducedMotion]);

  // Play a subtle entrance/update animation whenever cart changes surface a
  // genuinely new nearest offer (different coupon or threshold) — not on
  // every recalculation, so the animation doesn't replay on unrelated bill
  // updates (e.g. quantity tweaks that don't change the nearest offer).
  useEffect(() => {
    const key = nearestOfferProgress
      ? `${nearestOfferProgress.title}:${nearestOfferProgress.minOrder}`
      : null;
    if (key === lastOfferHintKey.current) return;
    lastOfferHintKey.current = key;

    if (key) {
      offerHintAnim.setValue(0);
      Animated.timing(offerHintAnim, { toValue: 1, ...motionConfig.screen }).start();
    } else {
      offerHintAnim.setValue(0);
    }
  }, [nearestOfferProgress, offerHintAnim]);

  // Coupon card first-appearance animation: fade + slide up once, then a
  // subtle one-time chevron nudge. Runs only on mount, never on recalculation.
  useEffect(() => {
    if (reducedMotion) {
      couponEntranceAnim.setValue(1);
      return;
    }

    const entrance = Animated.timing(couponEntranceAnim, {
      toValue: 1,
      duration: motionConfig.screen.duration,
      easing,
      useNativeDriver: true,
    });
    const nudge = Animated.sequence([
      Animated.timing(couponChevronNudge, { toValue: 4, duration: 160, easing, useNativeDriver: true }),
      Animated.timing(couponChevronNudge, { toValue: 0, duration: 160, easing, useNativeDriver: true }),
    ]);

    Animated.sequence([entrance, Animated.delay(80), nudge]).start();

    return () => {
      entrance.stop();
      nudge.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Crossfade + micro-animation when the coupon card genuinely changes state
  // (available → applied → error → empty). Guarded so it never re-fires on
  // bill recalculations that leave the state unchanged.
  useEffect(() => {
    const isFirstRun = prevCouponStateRef.current === undefined;
    const changed = prevCouponStateRef.current !== couponState;
    prevCouponStateRef.current = couponState;

    couponStateAnimRef.current?.stop();

    if (reducedMotion) {
      couponContentOpacity.setValue(1);
      couponCheckScale.setValue(1);
      couponErrorShake.setValue(0);
      return;
    }

    if (isFirstRun || !changed) return;

    couponContentOpacity.setValue(0);
    const crossfade = Animated.timing(couponContentOpacity, {
      toValue: 1,
      duration: smallMs,
      easing,
      useNativeDriver: true,
    });

    let stateAnim = null;
    if (couponState === 'error') {
      couponErrorShake.setValue(0);
      stateAnim = Animated.sequence([
        Animated.timing(couponErrorShake, { toValue: 1, duration: 45, useNativeDriver: true }),
        Animated.timing(couponErrorShake, { toValue: -1, duration: 45, useNativeDriver: true }),
        Animated.timing(couponErrorShake, { toValue: 1, duration: 45, useNativeDriver: true }),
        Animated.timing(couponErrorShake, { toValue: 0, duration: 45, useNativeDriver: true }),
      ]);
    }

    const combined = stateAnim ? Animated.parallel([crossfade, stateAnim]) : crossfade;
    couponStateAnimRef.current = combined;
    combined.start();

    return () => {
      combined.stop();
    };
  }, [couponState, reducedMotion, couponContentOpacity, couponCheckScale, couponErrorShake]);

  // Bounce the "Applied" check icon whenever a new coupon becomes applied.
  const prevAppliedCodeRef = useRef(undefined);
  useEffect(() => {
    const isFirstRun = prevAppliedCodeRef.current === undefined;
    const prevCode = prevAppliedCodeRef.current;
    prevAppliedCodeRef.current = appliedCouponCode;

    if (isFirstRun || reducedMotion || !appliedCouponCode || appliedCouponCode === prevCode) return;

    couponCheckScale.setValue(0.75);
    Animated.sequence([
      Animated.timing(couponCheckScale, { toValue: 1.08, duration: 140, easing, useNativeDriver: true }),
      Animated.timing(couponCheckScale, { toValue: 1, duration: 120, easing, useNativeDriver: true }),
    ]).start();
  }, [appliedCouponCode, reducedMotion, couponCheckScale]);

  const renderBillSkeleton = () => (
    <View style={styles.billCard}>
      <LoadingSkeleton style={styles.billSkeletonTitle} />
      <View style={styles.billSkeletonRows}>
        <LoadingSkeleton width="55%" height={14} />
        <LoadingSkeleton width="45%" height={14} />
        <LoadingSkeleton width="60%" height={14} />
      </View>
      <View style={styles.billSkeletonDivider} />
      <LoadingSkeleton width="70%" height={22} />
    </View>
  );

  const renderBillSummary = () => {
    if (!bill) return null;

    const deliveryFree = bill.deliveryCharge === 0;

    return (
      <Animated.View style={[styles.billCard, { opacity: listOpacity }]}>
        <Text style={styles.billTitle}>Bill Summary</Text>

        <View style={styles.billRows}>
          <BillRow label="Item Total" value={`₹${bill.subtotal}`} />
          <BillRow
            label="Delivery Charge"
            value={deliveryFree ? 'FREE' : `₹${bill.deliveryCharge}`}
            valueStyle={deliveryFree ? styles.freeDeliveryValue : null}
          />
          {bill.nightCharge > 0 && (
            <BillRow
              label="Night Charge"
              value={`₹${bill.nightCharge}`}
              valueStyle={styles.nightChargeValue}
            />
          )}
          {bill.discount > 0 && (
            <BillRow
              label="Discount"
              value={`− ₹${bill.discount}`}
              valueStyle={styles.discountValue}
            />
          )}
        </View>

        <View style={styles.billDivider} />

        <View style={styles.grandTotalRow}>
          <Text style={styles.grandTotalLabel}>Grand Total</Text>
          <Text style={styles.grandTotalValue}>₹{bill.grandTotal}</Text>
        </View>

        {freeDeliveryProgress && (
          <View style={styles.freeDeliveryBox}>
            <View style={styles.progressTrack}>
              <Animated.View
                style={[
                  styles.progressFill,
                  {
                    width: freeDeliveryAnim.interpolate({
                      inputRange: [0, 100],
                      outputRange: ['0%', '100%'],
                    }),
                  },
                ]}
              />
            </View>
            <Text style={styles.freeDeliveryHint}>
              {buildProgressHintText(freeDeliveryProgress, { suffix: ' for free delivery' })}
            </Text>
          </View>
        )}
      </Animated.View>
    );
  };

  const renderNearestOfferHint = () => {
    if (!nearestOfferProgress) return null;

    const translateY = offerHintAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [entryDistance, 0],
    });

    return (
      <Animated.View
        style={{
          opacity: offerHintAnim,
          transform: [{ translateY }],
        }}
      >
        <PressableScale
          onPress={() => setShowCouponSheet(true)}
          style={styles.nearestOfferBox}
          scaleTo={0.98}
          accessibilityRole="button"
          accessibilityLabel={buildProgressHintText(nearestOfferProgress, { suffix: ` to unlock ${nearestOfferProgress.title}` })}
        >
          <View style={styles.freeDeliveryRow}>
            <AppIcon name="box" size={16} color={colors.saffron} />
            <Text style={styles.freeDeliveryHeading} numberOfLines={1}>
              {nearestOfferProgress.title}
            </Text>
          </View>
          <View style={styles.progressTrack}>
            <Animated.View
              style={[
                styles.progressFill,
                {
                  width: nearestOfferAnim.interpolate({
                    inputRange: [0, 100],
                    outputRange: ['0%', '100%'],
                  }),
                },
              ]}
            />
          </View>
          <Text style={styles.freeDeliveryHint}>
            {buildProgressHintText(nearestOfferProgress, { suffix: ` to unlock ${nearestOfferProgress.title}` })}
          </Text>
        </PressableScale>
      </Animated.View>
    );
  };

  const renderCouponCard = () => {
    const chevronStyle = { transform: [{ translateX: couponChevronNudge }] };

    const entranceStyle = {
      opacity: couponEntranceAnim,
      transform: [{
        translateY: couponEntranceAnim.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }),
      }],
    };

    if (couponState === 'empty') {
      return (
        <Animated.View style={entranceStyle}>
          <View
            style={[styles.couponCard, styles.couponCardEmpty]}
            accessible
            accessibilityLabel="No eligible offers for this cart"
          >
            <Animated.View style={[styles.couponCardInner, { opacity: couponContentOpacity }]}>
              <View style={[styles.couponIconWrap, styles.couponIconWrapEmpty]}>
                <AppIcon name="ticket" size={20} color={colors.textTertiary} />
              </View>
              <View style={styles.couponTextWrap}>
                <Text style={styles.couponStatusLabelEmpty}>No offers available</Text>
                <Text style={styles.couponSubtextEmpty} numberOfLines={1}>No eligible offers for this cart</Text>
              </View>
            </Animated.View>
          </View>
        </Animated.View>
      );
    }

    let cardStyle;
    let iconWrapStyle;
    let iconNode;
    let statusLabelStyle;
    let statusLabel;
    let titleNode;
    let subtitleNode;
    let actionNode;
    let pressA11yLabel;
    let chevronColor;

    if (couponState === 'error') {
      cardStyle = styles.couponCardError;
      iconWrapStyle = styles.couponIconWrapError;
      iconNode = (
        <Animated.View style={{ transform: [{ translateX: Animated.multiply(couponErrorShake, 4) }] }}>
          <AppIcon name="close" size={18} color={colors.error} />
        </Animated.View>
      );
      statusLabelStyle = styles.couponStatusLabelError;
      statusLabel = "Offer couldn't apply";
      titleNode = (
        <Text style={styles.couponErrorText} numberOfLines={2}>{bill.couponError}</Text>
      );
      subtitleNode = null;
      actionNode = (
        <Text style={styles.couponActionCaptionError}>Fix</Text>
      );
      chevronColor = colors.error;
      pressA11yLabel = 'View offers to fix error';
    } else {
      // Available offers: show the top 2 inline, with a "Show more" button
      // that opens the full CouponSheet.
      return (
        <Animated.View style={entranceStyle}>
          <View style={styles.couponOffersSection}>
            <View style={styles.couponOffersHeadingRow}>
              <View style={styles.couponOffersHeadingLeft}>
                <AppIcon name="ticket" size={16} color={colors.saffron} />
                <Text style={styles.couponOffersHeading}>Available offers</Text>
              </View>
              <Text style={styles.couponOffersCount}>
                {pickableOffers.length} offer{pickableOffers.length !== 1 ? 's' : ''}
              </Text>
            </View>

            {/* A typed/tapped coupon failed but the server fell back to the
                best auto offer — show why alongside the applied discount. */}
            {bill?.couponError ? (
              <Text style={styles.couponInlineError} numberOfLines={2}>
                {bill.couponError}
              </Text>
            ) : null}

            {appliedCoupon && (
              <PressableScale
                key={appliedCoupon.id || appliedCoupon.code}
                onPress={handleRemoveCoupon}
                style={[styles.couponOfferCard, styles.couponOfferCardApplied]}
                scaleTo={0.98}
                accessibilityRole="button"
                accessibilityLabel={`Offer ${appliedCoupon.title} applied, ${
                  bill?.discount > 0 ? `Save ₹${bill.discount}` : formatOfferBadge(appliedCoupon)
                }. Double tap to remove`}
              >
                <View style={[styles.couponOfferIconFrame, styles.couponOfferIconFrameApplied]}>
                  <Animated.View style={{ transform: [{ scale: couponCheckScale }] }}>
                    <AppIcon name="check" size={16} color={colors.textInverse} strokeWidth={3} />
                  </Animated.View>
                </View>
                <View style={styles.couponOfferText}>
                  <Text style={styles.couponOfferTitle} numberOfLines={1}>{appliedCoupon.title}</Text>
                  {appliedCoupon.description ? (
                    <Text style={styles.couponOfferDesc} numberOfLines={1}>{appliedCoupon.description}</Text>
                  ) : null}
                </View>
                <View style={[styles.couponOfferSavingsPill, styles.couponOfferSavingsPillApplied]}>
                  <Text style={[styles.couponOfferSavingsText, styles.couponOfferSavingsTextApplied]} numberOfLines={1}>
                    Applied
                  </Text>
                </View>
              </PressableScale>
            )}

            {topOffers.map((coupon) => {
              const savings = formatOfferBadge(coupon);
              return (
                <PressableScale
                  key={coupon.id || coupon.code}
                  onPress={() => handleApplyCoupon(coupon.code, coupon)}
                  style={styles.couponOfferCard}
                  scaleTo={0.98}
                  accessibilityRole="button"
                  accessibilityLabel={`Apply offer ${coupon.title}, ${savings}`}
                >
                  <View style={styles.couponOfferIconFrame}>
                    <AppIcon name="ticket" size={16} color={colors.saffron} />
                  </View>
                  <View style={styles.couponOfferText}>
                    <Text style={styles.couponOfferTitle} numberOfLines={1}>{coupon.title}</Text>
                    {coupon.description ? (
                      <Text style={styles.couponOfferDesc} numberOfLines={1}>{coupon.description}</Text>
                    ) : null}
                  </View>
                  <View style={styles.couponOfferSavingsPill}>
                    <Text style={styles.couponOfferSavingsText} numberOfLines={1}>
                      {savings}
                    </Text>
                  </View>
                </PressableScale>
              );
            })}

            <PressableScale
              onPress={() => setShowCouponSheet(true)}
              style={styles.couponShowMoreBtn}
              scaleTo={0.98}
              accessibilityRole="button"
              accessibilityLabel="Show more offers"
            >
              <Text style={styles.couponShowMoreText}>Show more offers</Text>
              <AppIcon name="chevronRight" size={16} color={colors.saffron} />
            </PressableScale>
          </View>
        </Animated.View>
      );
    }

    return (
      <Animated.View style={entranceStyle}>
        <PressableScale
          onPress={() => setShowCouponSheet(true)}
          style={[styles.couponCard, cardStyle]}
          scaleTo={0.98}
          accessibilityRole="button"
          accessibilityLabel={pressA11yLabel}
        >
          <Animated.View style={[styles.couponCardInner, { opacity: couponContentOpacity }]}>
            <View style={[styles.couponIconWrap, iconWrapStyle]}>
              {iconNode}
            </View>
            <View style={styles.couponTextWrap}>
              <Text style={statusLabelStyle} numberOfLines={1}>{statusLabel}</Text>
              {titleNode}
              {subtitleNode}
            </View>
            <View style={styles.couponAction}>
              {actionNode}
              <Animated.View style={chevronStyle}>
                <AppIcon name="chevronRight" size={16} color={chevronColor} />
              </Animated.View>
            </View>
          </Animated.View>
        </PressableScale>
      </Animated.View>
    );
  };

  return (
    <AppScreen style={styles.container} safeAreaBottom={false}>
      <AppHeader
        title="Your Cart"
        onBack={() => navigation.goBack()}
        rightActions={validItems.length > 0 ? [
          {
            icon: (
              <View style={styles.clearBtnContent}>
                <AppIcon name="delete" size={12} color={colors.error} />
                <Text style={styles.clearBtnText}>Clear</Text>
              </View>
            ),
            onPress: handleClear,
            label: 'Clear Cart',
            style: styles.clearHeaderBtn,
          }
        ] : []}
      />

      {validItems.length === 0 ? (
        renderEmptyState()
      ) : (
        <View style={styles.content}>
          <ScrollView
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: bottomBarHeight + spacing.lg },
            ]}
            showsVerticalScrollIndicator={false}
          >
            {/* Cart Items */}
            <Animated.View
              style={[
                styles.itemsCard,
                {
                  opacity: fadeAnim,
                  transform: [{
                    translateY: fadeAnim.interpolate({ inputRange: [0, 1], outputRange: [entryDistance, 0] }),
                  }],
                },
              ]}
            >
              {validItems.map((item, index) => {
                const itemType = getItemType(item);
                const itemKey = getItemKey(item);
                const itemAnim = getItemAnim(itemKey);
                const isLast = index === validItems.length - 1;
                return (
                  <Animated.View
                    key={itemKey}
                    style={{
                      opacity: itemAnim,
                      transform: [{
                        translateY: itemAnim.interpolate({ inputRange: [0, 1], outputRange: [entryDistance, 0] }),
                      }],
                    }}
                  >
                    <View style={styles.itemRow}>
                      <ProductImage
                        uri={item.product.imageUri || item.product.imageUrl}
                        width={64}
                        height={64}
                        borderRadius={radius.md}
                        style={styles.itemImage}
                      />

                      <View style={styles.itemInfo}>
                        <Text style={styles.itemName} numberOfLines={2}>
                          {item.product.name}
                        </Text>
                        <View style={styles.itemMetaRow}>
                          <Text style={styles.itemUnit} numberOfLines={1}>
                            {item.product.unit}
                          </Text>
                          <Text style={styles.itemMetaDot}>·</Text>
                          <Text style={styles.itemPrice}>₹{item.product.price}</Text>
                        </View>
                        {!item.product.available && (
                          <Text style={styles.itemUnavailable}>Currently unavailable</Text>
                        )}
                      </View>

                      <View style={styles.itemControls}>
                        <QuantityStepper
                          compact
                          quantity={item.quantity}
                          onIncrement={() => updateQuantity(item.product.id, item.quantity + 1, itemType)}
                          onDecrement={() => {
                            if (item.quantity <= 1) handleRemove(item.product.id, itemType);
                            else updateQuantity(item.product.id, item.quantity - 1, itemType);
                          }}
                        />
                        <TouchableOpacity
                          style={styles.removeBtn}
                          onPress={() => handleRemove(item.product.id, itemType)}
                          accessibilityRole="button"
                          accessibilityLabel="Remove item"
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <AppIcon name="delete" size={15} color={colors.textSecondary} />
                        </TouchableOpacity>
                      </View>
                    </View>
                    {!isLast && <View style={styles.itemDivider} />}
                  </Animated.View>
                );
              })}
            </Animated.View>

            {/* Shop Closed Warning */}
            {shopStatus === 'closed' && (
              <View style={styles.shopClosedBox}>
                <AppIcon name="close" size={18} color={colors.error} />
                <Text style={styles.shopClosedText}>
                  The shop is currently closed. You can review your cart, but checkout is unavailable.
                </Text>
              </View>
            )}

            {/* Bill Summary */}
            {isCalculating ? renderBillSkeleton() : calcError ? (
              <View style={styles.billCard}>
                <ErrorState
                  message={calcError}
                  onRetry={calculateBill}
                  retryLabel="Retry"
                  style={styles.calcError}
                />
              </View>
            ) : renderBillSummary()}

            {/* Nearest unlockable offer progress hint */}
            {!isCalculating && !calcError && renderNearestOfferHint()}

            {/* Coupon / Offer Section */}
            {renderCouponCard()}
          </ScrollView>

          {/* Sticky Checkout Bar */}
          <Animated.View
            style={[
              styles.bottomBar,
              { paddingBottom: spacing.md + insets.bottom },
            ]}
          >
            <PressableScale
              onPress={handleCheckout}
              disabled={isCheckoutDisabled}
              style={[
                styles.checkoutBtn,
                isCheckoutDisabled && styles.checkoutBtnDisabled,
              ]}
              scaleTo={0.96}
              accessibilityRole="button"
              accessibilityLabel={bill ? `Proceed to Pay, ₹${bill.grandTotal}` : 'Checkout'}
            >
              <View style={styles.checkoutBtnContent}>
                <Text style={[
                  styles.checkoutBtnText,
                  isCheckoutDisabled && styles.checkoutBtnTextDisabled,
                ]}>
                  {checkoutBtnText}
                </Text>
                {!isCheckoutDisabled && (
                  <Animated.View style={[styles.checkoutArrow, { transform: [{ translateX: arrowAnim }] }]}>
                    <AppIcon name="chevronRight" size={18} color="#FFFFFF" />
                  </Animated.View>
                )}
              </View>
            </PressableScale>
          </Animated.View>
        </View>
      )}

      <CouponSheet
        visible={showCouponSheet}
        onClose={() => setShowCouponSheet(false)}
        subtotal={bill?.subtotal || 0}
        availableCoupons={bill?.availableCoupons || []}
        appliedCoupon={appliedCoupon}
        onApplyCoupon={handleApplyCoupon}
        onRemoveCoupon={handleRemoveCoupon}
      />
    </AppScreen>
  );
}

function BillRow({ label, value, valueStyle }) {
  return (
    <View style={styles.billRow}>
      <Text style={styles.billRowLabel}>{label}</Text>
      <Text style={[styles.billRowValue, valueStyle]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgApp,
  },
  content: {
    flex: 1,
  },
  clearHeaderBtn: {
    width: 'auto',
    height: 30,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.errorLight,
    borderWidth: 1,
    borderColor: colors.errorBorder,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    gap: 4,
  },
  clearBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  clearBtnText: {
    ...typography.labelSmall,
    color: colors.error,
    fontWeight: '700',
    fontSize: 11,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  scrollContent: {
    paddingTop: spacing.md,
    paddingHorizontal: spacing.screenPaddingH,
  },

  // ── Cart items (single grouped card, divided rows) ──────────────
  itemsCard: {
    backgroundColor: colors.bgSurface,
    borderRadius: radius.lg,
    borderWidth: borderWidth.thin,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
    ...shadows.xs,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  itemDivider: {
    height: borderWidth.thin,
    backgroundColor: colors.divider,
  },
  itemImage: {
    width: 64,
    height: 64,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  itemInfo: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  itemName: {
    ...typography.labelLarge,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  itemMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 6,
  },
  itemUnit: {
    ...typography.caption,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  itemMetaDot: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  itemPrice: {
    ...typography.labelSmall,
    color: colors.textPrimary,
    fontWeight: '800',
  },
  itemUnavailable: {
    ...typography.captionMedium,
    color: colors.error,
    marginTop: 4,
  },
  itemControls: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    flexShrink: 0,
  },
  removeBtn: {
    padding: spacing.xs,
    minWidth: layout.minTouchTarget,
    minHeight: layout.minTouchTarget - 8,
    alignItems: 'center',
    justifyContent: 'center',
  },

  shopClosedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.errorLight,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: borderWidth.thin,
    borderColor: colors.errorBorder,
    gap: spacing.sm,
  },
  shopClosedText: {
    ...typography.body,
    color: colors.error,
    flex: 1,
  },

  // ── Bill Summary ──────────────────────────────────────────────
  billCard: {
    backgroundColor: colors.bgSurface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: borderWidth.thin,
    borderColor: colors.border,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  billTitle: {
    ...typography.h4,
    color: colors.textPrimary,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  billRows: {
    gap: spacing.sm,
  },
  billRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  billRowLabel: {
    ...typography.body,
    color: colors.textSecondary,
  },
  billRowValue: {
    ...typography.label,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  freeDeliveryValue: {
    color: colors.success,
    fontWeight: '700',
  },
  nightChargeValue: {
    color: colors.warning,
  },
  discountValue: {
    color: colors.success,
  },
  billDivider: {
    height: borderWidth.thin,
    backgroundColor: colors.divider,
    marginVertical: spacing.md,
  },
  grandTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  grandTotalLabel: {
    ...typography.h4,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  grandTotalValue: {
    ...typography.priceLarge,
    color: colors.textPrimary,
    fontWeight: '800',
  },

  freeDeliveryBox: {
    marginTop: spacing.md,
  },
  nearestOfferBox: {
    backgroundColor: colors.saffronLight,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: borderWidth.thin,
    borderColor: colors.saffron,
    marginBottom: spacing.md,
    ...shadows.xs,
  },
  freeDeliveryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  freeDeliveryHeading: {
    ...typography.labelSmall,
    color: colors.saffronDark,
    fontWeight: '700',
  },
  progressTrack: {
    height: 5,
    backgroundColor: colors.saffron + '26',
    borderRadius: radius.pill,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.saffron,
    borderRadius: radius.pill,
  },
  freeDeliveryHint: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  freeDeliveryAmount: {
    ...typography.captionMedium,
    color: colors.saffronDark,
    fontWeight: '700',
  },
  billSkeletonTitle: {
    height: 18,
    width: '38%',
    marginBottom: spacing.md,
  },
  billSkeletonRows: {
    gap: spacing.sm,
  },
  billSkeletonDivider: {
    height: borderWidth.thin,
    backgroundColor: colors.divider,
    marginVertical: spacing.md,
  },
  calcError: {
    paddingVertical: 0,
  },

  // ── Coupon card (rectangular, aligned with Bill Summary card) ───
  couponCard: {
    borderRadius: radius.lg,
    borderWidth: borderWidth.thin,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  couponCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    minWidth: 0,
  },
  couponCardError: {
    backgroundColor: colors.errorLight,
    borderColor: colors.errorBorder,
    ...shadows.sm,
  },
  couponCardEmpty: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
  },
  couponAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginLeft: spacing.sm,
    flexShrink: 0,
  },
  couponIconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
    flexShrink: 0,
  },
  couponIconWrapError: {
    backgroundColor: colors.error + '1A',
  },
  couponIconWrapEmpty: {
    backgroundColor: colors.bgDisabled,
  },
  couponTextWrap: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  couponStatusLabelError: {
    ...typography.captionMedium,
    color: colors.error,
    fontWeight: '700',
  },
  couponStatusLabelEmpty: {
    ...typography.captionMedium,
    color: colors.textTertiary,
    fontWeight: '700',
  },
  couponSubtextEmpty: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: 2,
  },
  couponErrorText: {
    ...typography.caption,
    color: colors.error,
    marginTop: 2,
  },
  couponActionCaptionError: {
    ...typography.label,
    color: colors.error,
    fontWeight: '800',
  },
  couponInlineError: {
    ...typography.caption,
    color: colors.error,
  },

  // ── Inline offers section (top 2 offers + Show more button) ────
  couponOffersSection: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  couponOffersHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  couponOffersHeadingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  couponOffersHeading: {
    ...typography.label,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  couponOffersCount: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  couponOfferCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgSurface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: borderWidth.thin,
    borderStyle: 'dashed',
    borderColor: colors.saffron + '59',
    ...shadows.sm,
  },
  couponOfferCardApplied: {
    backgroundColor: colors.successLight,
    borderColor: colors.success + '59',
  },
  couponOfferIconFrame: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.saffronLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
    flexShrink: 0,
  },
  couponOfferIconFrameApplied: {
    backgroundColor: colors.success,
  },
  couponOfferText: {
    flex: 1,
    minWidth: 0,
  },
  couponOfferTitle: {
    ...typography.label,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  couponOfferDesc: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  couponOfferSavingsPill: {
    backgroundColor: colors.saffronLight,
    borderRadius: radius.pill,
    paddingVertical: 4,
    paddingHorizontal: spacing.md,
    marginLeft: spacing.sm,
    flexShrink: 0,
  },
  couponOfferSavingsPillApplied: {
    backgroundColor: colors.success,
  },
  couponOfferSavingsText: {
    ...typography.labelSmall,
    color: colors.saffronDark,
    fontWeight: '800',
  },
  couponOfferSavingsTextApplied: {
    color: colors.textInverse,
  },
  couponShowMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: borderWidth.thin,
    borderColor: colors.saffron + '40',
    backgroundColor: colors.bgSurface,
  },
  couponShowMoreText: {
    ...typography.label,
    color: colors.saffronDark,
    fontWeight: '700',
  },

  // ── Sticky checkout bar ───────────────────────────────────────
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bgSurface,
    borderTopWidth: borderWidth.thin,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    ...shadows.lg,
  },
  checkoutBtn: {
    height: layout.buttonHeightLarge,
    backgroundColor: colors.success,
    borderRadius: radius.button,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.lg,
    shadowColor: colors.success,
  },
  checkoutBtnDisabled: {
    backgroundColor: colors.bgDisabled,
    ...shadows.none,
  },
  checkoutBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  checkoutBtnText: {
    ...typography.buttonLarge,
    color: colors.textInverse,
    fontWeight: '800',
  },
  checkoutBtnTextDisabled: {
    color: colors.textDisabled,
  },
  checkoutArrow: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
