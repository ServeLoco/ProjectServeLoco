import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Image as ExpoImage } from 'expo-image';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Animated,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
  LayoutAnimation,
  Platform,
} from 'react-native';
import * as Location from 'expo-location';
import { CommonActions, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AppScreen,
  AppHeader,
  AppIcon,
  TextInputField,
  PressableScale,
  LoadingSkeleton,
} from '../../../components';
import { colors, typography, spacing, radius, shadows } from '../../../theme';
import { useCartStore, useSettingsStore, useAuthStore } from '../../../stores';
import { cartApi, ordersApi, imagesApi } from '../../../api';
import { asArray, buildProgressHintText, normalizeCartCalculation, normalizeImageUrl, normalizeOrder } from '../../../utils';
import { isCodBlockedDuringNight } from '../../../utils/nightDelivery';
import { formatEtaMinutes } from '../../../utils/formatEta';
import { uuidv4 } from '../../../utils/uuid';

const requestLocationPermission = async () => {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === Location.PermissionStatus.GRANTED;
};

export default function CheckoutScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const items = useCartStore(state => state.items);
  const clearCart = useCartStore(state => state.clearCart);
  const appliedCouponCode = useCartStore(state => state.appliedCouponCode);
  const appliedCouponId = useCartStore(state => state.appliedCouponId);
  const appliedCoupon = useCartStore(state => state.appliedCoupon);
  const couponAutoApplyDisabled = useCartStore(state => state.couponAutoApplyDisabled);
  const setFreeDeliveryProgress = useCartStore(state => state.setFreeDeliveryProgress);
  const shopStatus = useSettingsStore(state => state.shopStatus);
  const deliveryAvailable = useSettingsStore(state => state.deliveryAvailable);
  const upiId = useSettingsStore(state => state.upiId);
  const upiQrImageId = useSettingsStore(state => state.upiQrImageId);
  const upiQrImageUrl = useSettingsStore(state => state.upiQrImageUrl);
  const nightChargeStart = useSettingsStore(state => state.nightChargeStart);
  const nightChargeEnd = useSettingsStore(state => state.nightChargeEnd);
  const nightCharge = useSettingsStore(state => state.nightCharge);
  const setSettings = useSettingsStore(state => state.setSettings);
  const userProfile = useAuthStore(state => state.profile);

  const [now, setNow] = React.useState(() => new Date());
  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 60 * 1000);
    return () => clearInterval(tick);
  }, []);

  const codBlockedByNight = isCodBlockedDuringNight({
    night_charge_start: nightChargeStart,
    night_charge_end: nightChargeEnd,
    night_charge: nightCharge,
  }, now);

  // Form State
  const [address, setAddress] = useState(userProfile?.address || '');
  const [coordinates, setCoordinates] = useState(null);
  const [gpsStatus, setGpsStatus] = useState('idle'); // idle | loading | success | error
  const [gpsError, setGpsError] = useState(null);
  // How the user is providing their delivery address: pick it up automatically
  // via GPS, or type it in by hand. Starts unselected unless we already have
  // an address from their profile, in which case manual entry is pre-selected.
  const [locationMode, setLocationMode] = useState(() => (userProfile?.address ? 'manual' : null));
  const [paymentMethod, setPaymentMethod] = useState('Cash'); // Cash | UPI
  const [deliveryType, setDeliveryType] = useState('standard'); // standard | fast

  // Submission State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [bill, setBill] = useState(null);
  const [calcError, setCalcError] = useState(null);
  const checkoutItems = useMemo(() => items.map(item => {
    const type = item.type || (item.product?.isCombo || item.product?.is_combo ? 'combo' : 'product');
    return {
      productId: item.product.id,
      variantId: item.variant?.id ?? null,
      quantity: item.quantity,
      type,
      isCombo: type === 'combo',
    };
  }), [items]);
  const calculationPayload = useMemo(() => ({
    items: checkoutItems,
    latitude: coordinates?.lat,
    longitude: coordinates?.lng,
    delivery_type: deliveryType,
    coupon_code: appliedCouponCode || undefined,
    coupon_id: !appliedCouponCode && appliedCouponId ? appliedCouponId : undefined,
    no_auto_apply: couponAutoApplyDisabled,
  }), [checkoutItems, coordinates, deliveryType, appliedCouponCode, appliedCouponId, couponAutoApplyDisabled]);

  // Animations
  const deliverySlide = useRef(new Animated.Value(20)).current;
  const paymentSlide = useRef(new Animated.Value(20)).current;
  const summarySlide = useRef(new Animated.Value(20)).current;
  const btnScale = useRef(new Animated.Value(1)).current;
  const arrowAnim = useRef(new Animated.Value(0)).current;
  const gpsPulse = useRef(new Animated.Value(1)).current;
  const gpsIconScale = useRef(new Animated.Value(1)).current;
  const manualIconScale = useRef(new Animated.Value(1)).current;
  const manualPanelFade = useRef(new Animated.Value(userProfile?.address ? 1 : 0)).current;
  // 0 -> 1 selected-state progress per delivery-mode row, driving the badge
  // fill, row border/background, and radio-dot animations together.
  const gpsRowProgress = useRef(new Animated.Value(0)).current;
  const manualRowProgress = useRef(new Animated.Value(userProfile?.address ? 1 : 0)).current;

  // Profile has no saved address — fall back to the address on the user's
  // most recent order so they don't have to retype it from scratch.
  useEffect(() => {
    if (userProfile?.address) return;

    ordersApi.getOrders({ limit: 1 })
      .then(response => {
        const lastOrder = asArray(response, ['orders']).map(normalizeOrder)[0];
        if (lastOrder?.address) {
          setAddress(lastOrder.address);
          setLocationMode('manual');
          manualPanelFade.setValue(1);
          manualRowProgress.setValue(1);
        }
      })
      .catch(() => {});
    // Only ever needed once, right after mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Synchronous double-submit guard. React state is async, so isSubmitting alone
  // does not protect against a fast double-tap on Place Order.
  const isSubmittingRef = useRef(false);

  // Idempotency-Key for this Place Order attempt. Kept across retries so
  // the server can recognise "same attempt, please don't double-charge".
  // Reset to null once the order is created so a fresh checkout session
  // gets a fresh key.
  const idempotencyKeyRef = useRef(null);

  // Block hardware-back / gesture-back / programmatic navigation away
  // while a Place Order is in flight. Without this, the user can swipe
  // back or hit the system back button while the order is being created,
  // unmount the screen, and end up with a "ghost" order on the server
  // with no way to see it in the app.
  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', (e) => {
      if (!isSubmittingRef.current) return;
      e.preventDefault();
    });
    return unsub;
  }, [navigation]);

  useEffect(() => {
    // Staggered entrance
    Animated.stagger(100, [
      Animated.timing(deliverySlide, { toValue: 0, duration: 400, useNativeDriver: true }),
      Animated.timing(paymentSlide, { toValue: 0, duration: 400, useNativeDriver: true }),
      Animated.timing(summarySlide, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start();
  }, [deliverySlide, paymentSlide, summarySlide]);

  // If the admin disables fast delivery entirely, fall back to standard.
  useEffect(() => {
    if (deliveryType === 'fast' && bill && bill.fastDeliveryEnabled === false) {
      setDeliveryType('standard');
    }
  }, [bill, deliveryType]);

  // If the current time is inside the night delivery window, COD is unavailable
  // and we force the user to UPI.
  useEffect(() => {
    if (codBlockedByNight && paymentMethod === 'Cash') {
      setPaymentMethod('UPI');
    }
  }, [codBlockedByNight, paymentMethod]);

  // Fetching settings on mount was removed to save network requests (Task 3.5)

  useEffect(() => {
    if (upiQrImageUrl || !upiQrImageId) return undefined;

    let isActive = true;

    imagesApi.getImage(upiQrImageId)
      .then(response => {
        const image = response?.data || response?.image || response;
        const imageUrl = normalizeImageUrl(image?.imageUrl || image?.image_url || image?.url);
        if (isActive && imageUrl) {
          setSettings({ upiQrImageUrl: imageUrl });
        }
      })
      .catch(() => {});

    return () => {
      isActive = false;
    };
  }, [setSettings, upiQrImageId, upiQrImageUrl]);

  useEffect(() => {
    const arrowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(arrowAnim, {
          toValue: 5,
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

  useEffect(() => {
    let gpsLoop;
    if (gpsStatus === 'success') {
      gpsPulse.setValue(1);
      gpsLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(gpsPulse, {
            toValue: 1.15,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(gpsPulse, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      );
      gpsLoop.start();
    } else {
      gpsPulse.setValue(1);
    }
    return () => {
      if (gpsLoop) {
        gpsLoop.stop();
      }
    };
  }, [gpsStatus, gpsPulse]);

  useEffect(() => {
    let isActive = true;

    if (checkoutItems.length === 0) {
      setBill(null);
      setCalcError(null);
      return undefined;
    }

    // Debounce so rapid toggles (delivery type, coordinates updates) don't fire
    // a burst of parallel cart/calculate requests.
    const debounceMs = 250;
    const timer = setTimeout(() => {
      setIsCalculating(true);
      setCalcError(null);

      cartApi.calculate(calculationPayload)
        .then(response => {
          if (!isActive) return;
          const normalized = normalizeCartCalculation(response);
          setBill(normalized);
          setFreeDeliveryProgress(normalized.freeDeliveryProgress);
        })
        .catch(error => {
          if (!isActive) return;
          setBill(null);
          setCalcError(error?.message || 'Unable to calculate checkout total.');
        })
        .finally(() => {
          if (isActive) setIsCalculating(false);
        });
    }, debounceMs);

    return () => {
      isActive = false;
      clearTimeout(timer);
    };
  }, [calculationPayload, checkoutItems.length]);

  const handleRequestGPS = async () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setGpsStatus('loading');
    setGpsError(null);

    try {
      const hasPermission = await requestLocationPermission();

      if (!hasPermission) {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setGpsStatus('error');
        setGpsError('Location permission was denied. GPS location is required for delivery.');
        return;
      }

      // 8s timeout — the device's GPS can hang on poor signal or
      // when the user has location services half-on. A timeout lets
      // the user proceed without GPS instead of staring at "Pinning
      // Location..." forever.
      const position = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('GPS request timed out. Please try again or proceed without location.')), 8000)),
      ]);

      const { latitude, longitude } = position.coords;

      // Reverse-geocode so the address field fills itself in — the user
      // picked "use my current location" specifically to avoid typing it.
      let resolvedAddress = null;
      try {
        const places = await Location.reverseGeocodeAsync({ latitude, longitude });
        const place = places?.[0];
        if (place) {
          resolvedAddress = [place.name, place.street, place.district || place.subregion, place.city, place.region, place.postalCode]
            .filter(Boolean)
            .join(', ');
        }
      } catch {
        // Reverse geocoding failed (offline, no provider, etc). Fall back
        // to a coordinate-based label below so the order can still proceed.
      }

      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setBill(null);
      setCalcError(null);
      setSubmitError(null);
      setCoordinates({ lat: latitude, lng: longitude });
      setAddress(resolvedAddress || `Pinned location (${latitude.toFixed(5)}, ${longitude.toFixed(5)})`);
      setGpsStatus('success');
    } catch (error) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setGpsStatus('error');
      setGpsError(error.message || 'Failed to get location. Please try again.');
    }
  };

  const selectMode = (mode) => {
    // Tapping the already-selected GPS card again is treated as "retry".
    if (mode === locationMode) {
      if (mode === 'gps') handleRequestGPS();
      return;
    }

    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setLocationMode(mode);
    setSubmitError(null);

    const iconScale = mode === 'gps' ? gpsIconScale : manualIconScale;
    iconScale.setValue(1);
    Animated.sequence([
      Animated.spring(iconScale, { toValue: 1.18, useNativeDriver: true, speed: 24, bounciness: 10 }),
      Animated.spring(iconScale, { toValue: 1, useNativeDriver: true, speed: 24, bounciness: 6 }),
    ]).start();

    Animated.timing(gpsRowProgress, {
      toValue: mode === 'gps' ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
    Animated.timing(manualRowProgress, {
      toValue: mode === 'manual' ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();

    Animated.timing(manualPanelFade, {
      toValue: mode === 'manual' ? 1 : 0,
      duration: 250,
      useNativeDriver: true,
    }).start();

    if (mode === 'gps') {
      handleRequestGPS();
    }
  };

  const handleOpenMap = () => {
    if (!coordinates) {
      return;
    }

    const { lat, lng } = coordinates;
    const url = Platform.select({
      ios: `maps:0,0?q=${lat},${lng}`,
      android: `geo:${lat},${lng}?q=${lat},${lng}`,
      default: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
    });

    Linking.openURL(url).catch(() => {});
  };

  const createOrder = async (currentBill) => {
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    Animated.spring(btnScale, { toValue: 0.95, useNativeDriver: true }).start();

    try {
      const orderResponse = await ordersApi.createOrder(
        {
          items: checkoutItems,
          deliveryAddress: address.trim(),
          address: address.trim(),
          latitude: coordinates?.lat,
          longitude: coordinates?.lng,
          mapUrl: coordinates
            ? `https://www.google.com/maps/search/?api=1&query=${coordinates.lat},${coordinates.lng}`
            : undefined,
          paymentMethod,
          delivery_type: deliveryType,
          coupon_code: appliedCouponCode || undefined,
          coupon_id: !appliedCouponCode && appliedCouponId ? appliedCouponId : undefined,
          no_auto_apply: couponAutoApplyDisabled,
          // Lets the server distinguish an auto-applied offer (drop silently
          // if it lapsed since the cart) from a typed/tapped one (hard error).
          coupon_auto_applied: appliedCoupon?.autoApplied === true,
        },
        { headers: { 'Idempotency-Key': idempotencyKeyRef.current } }
      );
      const responseOrder = orderResponse?.order || orderResponse?.data || orderResponse;
      const orderId = responseOrder?.id || responseOrder?.orderId || orderResponse?.orderId;
      const confirmationParams = {
        orderId,
        order: {
          ...responseOrder,
          id: orderId,
          address: address.trim(),
          total: responseOrder?.total || currentBill.grandTotal,
          paymentMethod,
        },
      };

      // Clear the submit guard BEFORE dispatching the stack reset so the
      // beforeRemove listener (which blocks back-gestures mid-submission)
      // doesn't intercept and cancel this programmatic navigation.
      isSubmittingRef.current = false;

      navigation.dispatch(
        CommonActions.reset({
          index: 1,
          routes: [
            { name: 'MainTabs', params: { screen: 'Orders' } },
            { name: 'OrderConfirmation', params: confirmationParams },
          ],
        })
      );
      clearCart();
      // Order created successfully — clear the key so a future checkout
      // session generates a fresh one.
      idempotencyKeyRef.current = null;
    } catch (error) {
      setSubmitError(error.message || 'Unable to place order. Please try again.');
      // Keep the key on failure so a retry reuses it (server will dedupe).
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
      Animated.spring(btnScale, { toValue: 1, useNativeDriver: true }).start();
    }
  };

  const handlePlaceOrder = async () => {
    // Synchronous re-entry guard.
    if (isSubmittingRef.current) return;
    if (!address.trim()) {
      setSubmitError('Please enter a delivery address');
      return;
    }
    if (shopStatus === 'closed') {
      setSubmitError('The shop is currently closed. We cannot accept orders right now.');
      return;
    }
    // Location is now optional - removed coordinate requirement
    if (isCalculating || calcError || !bill) {
      setSubmitError('Please wait while we verify the order total.');
      return;
    }
    // Removed requiresLocation check - location is optional
    // Removed deliveryWithinRange check - will be validated by backend

    isSubmittingRef.current = true;
    setSubmitError(null);
    setIsSubmitting(true);

    // Generate a fresh Idempotency-Key for this Place Order attempt. If the
    // request fails on a flaky connection and the user retries, we'll keep
    // the SAME key (stored in this ref) so the server can recognise the
    // retry and return the original order instead of creating a duplicate.
    const idempotencyKey = idempotencyKeyRef.current || uuidv4();
    idempotencyKeyRef.current = idempotencyKey;

    // Animate button loading state
    Animated.spring(btnScale, { toValue: 0.95, useNativeDriver: true }).start();

    try {
      const verifiedBill = normalizeCartCalculation(await cartApi.calculate(calculationPayload));
      setBill(verifiedBill);

      const oldGrandTotal = bill?.grandTotal;
      if (oldGrandTotal !== undefined && verifiedBill.grandTotal !== oldGrandTotal) {
        setBill(verifiedBill);
        setFreeDeliveryProgress(verifiedBill.freeDeliveryProgress);
        isSubmittingRef.current = false;
        setIsSubmitting(false);
        Animated.spring(btnScale, { toValue: 1, useNativeDriver: true }).start();
        Alert.alert(
          'Total changed',
          `The total has changed from ₹${oldGrandTotal} to ₹${verifiedBill.grandTotal} (prices or charges were updated). Place order at the new total?`,
          [
            {
              text: 'Cancel',
              style: 'cancel',
              onPress: () => {},
            },
            {
              text: 'Place Order',
              onPress: () => createOrder(verifiedBill),
            },
          ],
          { cancelable: false }
        );
        return;
      }

      await createOrder(verifiedBill);
    } catch (error) {
      setSubmitError(error.message || 'Unable to place order. Please try again.');
      isSubmittingRef.current = false;
      setIsSubmitting(false);
      Animated.spring(btnScale, { toValue: 1, useNativeDriver: true }).start();
    }
  };

  const freeDeliveryProgress = bill?.freeDeliveryProgress || null;
  const totalQuantity = items.reduce((total, item) => total + (Number(item.quantity) || 0), 0);
  // Location is now optional - removed delivery validation checks
  const isModeSelectDisabled = isSubmitting || items.length === 0 || gpsStatus === 'loading';
  const isPlaceOrderDisabled = isSubmitting || isCalculating || items.length === 0 || !bill || Boolean(calcError);
  const placeOrderLabel = isSubmitting
    ? 'Processing...'
    : isCalculating
    ? 'Calculating total...'
    : bill
    ? `Place Order • ₹${bill.grandTotal}`
    : 'Place Order';  return (
    <AppScreen style={styles.container} safeAreaBottom={false}>
      <AppHeader
        title="Checkout"
        onBack={() => navigation.goBack()}
      />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Delivery Details */}
        <Animated.View style={[styles.section, { transform: [{ translateY: deliverySlide }] }]}>
          <Text style={styles.sectionTitle}>Delivery Details</Text>
          <Text style={styles.sectionSubtitle}>How should we get your delivery address?</Text>

          <View style={styles.optionList}>
            <View
              style={[
                styles.optionRow,
                locationMode === 'gps' && styles.optionRowActive,
                isModeSelectDisabled && styles.optionRowDisabled,
              ]}
            >
              <PressableScale
                onPress={() => selectMode('gps')}
                disabled={isModeSelectDisabled}
                style={styles.optionRowPressable}
                scaleTo={0.98}
                accessibilityRole="button"
                accessibilityLabel="Use my current location"
                accessibilityState={{ selected: locationMode === 'gps', disabled: isModeSelectDisabled }}
              >
                <View style={[styles.optionIconBadge, locationMode === 'gps' && styles.optionIconBadgeActive]}>
                  <Animated.View style={{ transform: [{ scale: gpsIconScale }] }}>
                    <AppIcon name="navigation" size={18} color={locationMode === 'gps' ? colors.textInverse : colors.primary} />
                  </Animated.View>
                </View>
                <View style={styles.optionTextWrap}>
                  <Text style={styles.optionTitle}>Current Location</Text>
                  <Text style={styles.optionSubtitle}>Auto-detect via GPS</Text>
                </View>
                <View style={[styles.radioOuter, locationMode === 'gps' && styles.radioOuterActive]}>
                  <Animated.View style={[styles.radioInner, { opacity: gpsRowProgress, transform: [{ scale: gpsRowProgress }] }]} />
                </View>
              </PressableScale>
            </View>

            <View
              style={[
                styles.optionRow,
                locationMode === 'manual' && styles.optionRowActive,
                isModeSelectDisabled && styles.optionRowDisabled,
              ]}
            >
              <PressableScale
                onPress={() => selectMode('manual')}
                disabled={isModeSelectDisabled}
                style={styles.optionRowPressable}
                scaleTo={0.98}
                accessibilityRole="button"
                accessibilityLabel="Enter address manually"
                accessibilityState={{ selected: locationMode === 'manual', disabled: isModeSelectDisabled }}
              >
                <View style={[styles.optionIconBadge, locationMode === 'manual' && styles.optionIconBadgeActive]}>
                  <Animated.View style={{ transform: [{ scale: manualIconScale }] }}>
                    <AppIcon name="pencil" size={18} color={locationMode === 'manual' ? colors.textInverse : colors.primary} />
                  </Animated.View>
                </View>
                <View style={styles.optionTextWrap}>
                  <Text style={styles.optionTitle}>Enter Manually</Text>
                  <Text style={styles.optionSubtitle}>Type your address</Text>
                </View>
                <View style={[styles.radioOuter, locationMode === 'manual' && styles.radioOuterActive]}>
                  <Animated.View style={[styles.radioInner, { opacity: manualRowProgress, transform: [{ scale: manualRowProgress }] }]} />
                </View>
              </PressableScale>
            </View>
          </View>

          {locationMode === 'manual' && (
            <Animated.View style={{ opacity: manualPanelFade }}>
              <TextInputField
                label="Complete Address"
                placeholder="House No, Building, Street, Area"
                value={address}
                onChangeText={(text) => {
                  setAddress(text);
                  if (submitError) setSubmitError(null);
                }}
                multiline
                numberOfLines={3}
                containerStyle={styles.addressInput}
              />
            </Animated.View>
          )}

          {locationMode === 'gps' && (
            <View style={styles.gpsContainer}>
              {gpsStatus === 'loading' ? (
                <View style={styles.gpsLoading}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={styles.gpsLoadingText}>Fetching your location...</Text>
                </View>
              ) : gpsStatus === 'success' ? (
                <View style={styles.gpsSuccess}>
                  <Animated.View style={[styles.gpsSuccessIconFrame, { transform: [{ scale: gpsPulse }] }]}>
                    <AppIcon name="location" size={22} color={colors.success} />
                  </Animated.View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.gpsSuccessText}>Location Pinned</Text>
                    <Text numberOfLines={2} style={styles.gpsAddressText}>{address}</Text>
                    <Text style={styles.gpsCoords}>
                      {coordinates?.lat?.toFixed(6)}, {coordinates?.lng?.toFixed(6)}
                    </Text>
                  </View>
                  <TouchableOpacity style={styles.mapActionBtn} onPress={handleOpenMap}>
                    <AppIcon name="navigation" size={16} color={colors.primary} />
                  </TouchableOpacity>
                </View>
              ) : gpsStatus === 'error' ? (
                <View style={styles.gpsErrorContainer}>
                  <AppIcon name="delete" size={16} color={colors.error} style={{ marginRight: spacing.sm }} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.gpsErrorText}>{gpsError || 'Failed to get location. Please try again.'}</Text>
                    <TouchableOpacity onPress={handleRequestGPS} style={styles.gpsRetryBtn}>
                      <Text style={styles.gpsRetryText}>Try Again</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}
            </View>
          )}
        </Animated.View>

        {/* Delivery Type Selector — shown whenever the admin has enabled fast delivery.
            Fast delivery fully replaces the standard charge, regardless of threshold/free-offer. */}
        {bill?.fastDeliveryEnabled && (
          <Animated.View style={[styles.section, { transform: [{ translateY: paymentSlide }] }]}>
            <Text style={styles.sectionTitle}>Delivery Speed</Text>
            <View style={styles.deliveryTypeRow}>
              {/* Standard */}
              <PressableScale
                style={[styles.deliveryTypeCard, deliveryType === 'standard' && styles.deliveryTypeCardActive]}
                onPress={() => setDeliveryType('standard')}
                scaleTo={0.97}
                accessibilityRole="button"
                accessibilityLabel="Standard delivery"
                accessibilityState={{ selected: deliveryType === 'standard' }}
              >
                <Text style={styles.deliveryTypeEmoji}>🕐</Text>
                <View style={styles.deliveryTypeInfo}>
                  <Text numberOfLines={1} style={[styles.deliveryTypeTitle, deliveryType === 'standard' && styles.deliveryTypeTitleActive]}>Standard Delivery</Text>
                  <Text numberOfLines={1} style={styles.deliveryTypeTime}>Arrives in {formatEtaMinutes(bill.standardDeliveryMinutes) || '—'}</Text>
                </View>
                <Text numberOfLines={1} style={[styles.deliveryTypePrice, deliveryType === 'standard' && styles.deliveryTypePriceActive]}>
                  {bill.standardDeliveryCharge === 0 ? 'FREE' : `₹${bill.standardDeliveryCharge}`}
                </Text>
                {deliveryType === 'standard' && (
                  <View style={styles.deliveryTypeCheck}><Text style={styles.deliveryTypeCheckText}>✓</Text></View>
                )}
              </PressableScale>

              {/* Fast */}
              <PressableScale
                style={[styles.deliveryTypeCard, styles.deliveryTypeCardFast, deliveryType === 'fast' && styles.deliveryTypeCardFastActive]}
                onPress={() => setDeliveryType('fast')}
                scaleTo={0.97}
                accessibilityRole="button"
                accessibilityLabel="Fast delivery"
                accessibilityState={{ selected: deliveryType === 'fast' }}
              >
                <Text style={styles.deliveryTypeEmoji}>⚡</Text>
                <View style={styles.deliveryTypeInfo}>
                  <Text numberOfLines={1} style={[styles.deliveryTypeTitleFast, deliveryType === 'fast' && styles.deliveryTypeTitleFastActive]}>Fast Delivery</Text>
                  <Text numberOfLines={1} style={styles.deliveryTypeTime}>Arrives in {formatEtaMinutes(bill.fastDeliveryMinutes) || '—'}</Text>
                </View>
                <Text numberOfLines={1} style={[styles.deliveryTypePriceFast, deliveryType === 'fast' && styles.deliveryTypePriceFastActive]}>
                  ₹{bill.fastDeliveryCharge}
                </Text>
                {deliveryType === 'fast' && (
                  <View style={[styles.deliveryTypeCheck, styles.deliveryTypeCheckFast]}><Text style={styles.deliveryTypeCheckText}>✓</Text></View>
                )}
              </PressableScale>
            </View>
          </Animated.View>
        )}

        {/* Payment Method */}
        <Animated.View style={[styles.section, { transform: [{ translateY: paymentSlide }] }]}>
          <Text style={styles.sectionTitle}>Payment Method</Text>

          {codBlockedByNight && (
            <View style={styles.nightNotice}>
              <AppIcon name="clock" size={16} color={colors.saffron || '#FF7A3A'} style={{ marginRight: spacing.sm }} />
              <Text style={styles.nightNoticeText}>
                Cash on Delivery is unavailable during night delivery hours ({nightChargeStart || '—'} to {nightChargeEnd || '—'}). Please use UPI.
              </Text>
            </View>
          )}

          <View style={styles.paymentOptions}>
            <PressableScale
              style={[
                styles.paymentBox,
                paymentMethod === 'Cash' && !codBlockedByNight && styles.paymentBoxActive,
                codBlockedByNight && styles.paymentBoxDisabled,
              ]}
              onPress={() => {
                if (!codBlockedByNight) setPaymentMethod('Cash');
              }}
              disabled={codBlockedByNight}
              scaleTo={codBlockedByNight ? 1 : 0.96}
              accessibilityRole="button"
              accessibilityLabel="Cash on Delivery"
              accessibilityState={{ disabled: codBlockedByNight, selected: paymentMethod === 'Cash' && !codBlockedByNight }}
            >
              <AppIcon
                name="rupee"
                size={28}
                color={codBlockedByNight ? colors.textDisabled : (paymentMethod === 'Cash' ? colors.success : colors.textSecondary)}
                style={styles.paymentIcon}
              />
              <Text style={[
                styles.paymentText,
                paymentMethod === 'Cash' && !codBlockedByNight && styles.paymentTextActive,
                codBlockedByNight && styles.paymentTextDisabled,
              ]}>
                Cash on Delivery
              </Text>
              {codBlockedByNight && (
                <Text style={styles.paymentBlockedHint}>Unavailable at night</Text>
              )}
            </PressableScale>

            <PressableScale
              style={[styles.paymentBox, paymentMethod === 'UPI' && styles.paymentBoxActive]}
              onPress={() => setPaymentMethod('UPI')}
              scaleTo={0.96}
              accessibilityRole="button"
              accessibilityLabel="UPI / Online"
              accessibilityState={{ selected: paymentMethod === 'UPI' }}
            >
              <AppIcon
                name="creditCard"
                size={28}
                color={paymentMethod === 'UPI' ? colors.success : colors.textSecondary}
                style={styles.paymentIcon}
              />
              <Text style={[styles.paymentText, paymentMethod === 'UPI' && styles.paymentTextActive]}>UPI / Online</Text>
            </PressableScale>
          </View>
          
          <Text style={styles.paymentPendingNote}>
            {paymentMethod === 'UPI' ? 'Scan and pay before or after placing the order.' : 'Pay cash to the delivery executive.'}
          </Text>

          {paymentMethod === 'UPI' && (
            <View style={styles.upiPanel}>
              <View style={styles.upiPanelHeader}>
                <View style={styles.upiIconFrame}>
                  <AppIcon name="creditCard" size={18} color={colors.success} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.upiTitle}>Pay here</Text>
                  <Text style={styles.upiSubtitle}>Scan this QR and keep the payment screenshot ready.</Text>
                </View>
              </View>

              <View style={styles.upiAmountCard}>
                <Text style={styles.upiAmountLabel}>Amount to pay</Text>
                <Text style={styles.upiAmountValue}>{bill ? `₹${bill.grandTotal}` : 'Calculating...'}</Text>
              </View>

              <View style={styles.upiQrWrap}>
                <View style={styles.qrShell}>
                  {upiQrImageUrl ? (
                    <ExpoImage
                      source={{ uri: upiQrImageUrl }}
                      style={styles.qrImage}
                      contentFit="contain"
                      transition={200}
                    />
                  ) : (
                    <View style={styles.qrPlaceholder}>
                      <AppIcon name="image" size={30} color={colors.textTertiary} />
                      <Text style={styles.qrPlaceholderText}>QR not available</Text>
                    </View>
                  )}
                </View>
                {upiId ? (
                  <View style={styles.upiIdPill}>
                    <Text style={styles.upiIdLabel}>UPI ID</Text>
                    <Text style={styles.upiIdValue}>{upiId}</Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.screenshotNote}>
                <AppIcon name="check" size={16} color={colors.success} />
                <Text style={styles.screenshotNoteText}>
                  You can show the payment screenshot at the time of delivery.
                </Text>
              </View>
            </View>
          )}
        </Animated.View>

        {/* Order Summary */}
        <Animated.View style={[styles.section, { transform: [{ translateY: summarySlide }] }]}>
          <Text style={styles.sectionTitle}>Order Summary</Text>
          
          <View style={styles.summaryBox}>
            {isCalculating ? (
              <View style={styles.calcSkeleton}>
                <LoadingSkeleton style={{ height: 18, width: '60%', marginBottom: 10 }} />
                <LoadingSkeleton style={{ height: 14, width: '40%', marginBottom: 10 }} />
                <LoadingSkeleton style={{ height: 14, width: '50%', marginBottom: 10 }} />
                <LoadingSkeleton style={{ height: 22, width: '70%', marginTop: 6 }} />
              </View>
            ) : calcError ? (
              <Text style={styles.calcErrorText}>{calcError}</Text>
            ) : bill ? (
              <>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Items ({totalQuantity})</Text>
                  <Text style={styles.summaryValue}>₹{bill.subtotal}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>
                    {bill.deliveryType === 'fast' ? '⚡ Fast Delivery' : 'Delivery Charge'}
                  </Text>
                  {bill.isFreeDeliveryApplied ? (
                    <View style={styles.freeDeliveryValueRow}>
                      <Text style={styles.summaryStrikethrough}>₹{bill.deliveryCharge}</Text>
                      <Text style={[styles.summaryValue, styles.freeDeliveryText]}>FREE</Text>
                    </View>
                  ) : (
                    <Text style={styles.summaryValue}>₹{bill.deliveryCharge}</Text>
                  )}
                </View>
                {/* Distance display removed since it's no longer used for pricing */}
                {(() => {
                  const isFreeDeliveryApplied = Boolean(bill.isFreeDeliveryApplied);
                  if (!deliveryAvailable) {
                    return (
                      <Text style={[styles.deliveryStatusText, styles.deliveryStatusError]}>
                        Delivery is currently unavailable in your area.
                      </Text>
                    );
                  }
                  if (bill.deliveryMessage || bill.requiresLocation || !bill.deliveryWithinRange || isFreeDeliveryApplied) {
                    return (
                      <Text style={[
                        styles.deliveryStatusText,
                        !bill.deliveryWithinRange && styles.deliveryStatusError,
                        isFreeDeliveryApplied && styles.deliveryStatusSuccess,
                      ]}>
                        {bill.deliveryMessage || (bill.requiresLocation ? 'Pin location to continue.' : 'Delivery available.')}
                      </Text>
                    );
                  }
                  return null;
                })()}
                {bill.nightCharge > 0 && (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Night Charge</Text>
                    <Text style={styles.summaryValue}>₹{bill.nightCharge}</Text>
                  </View>
                )}
                {(() => {
                  const discountToShow = bill.isFreeDeliveryApplied ? bill.itemDiscount : bill.discount;
                  if (!(discountToShow > 0)) return null;
                  return (
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>Discount</Text>
                      <Text style={styles.summaryValue}>- ₹{discountToShow}</Text>
                    </View>
                  );
                })()}
                <View style={styles.divider} />
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryTotalLabel}>Total to Pay</Text>
                  <Text style={styles.summaryTotalValue}>₹{bill.grandTotal}</Text>
                </View>
                {freeDeliveryProgress && (
                  <View style={styles.warningBox}>
                    <AppIcon name="box" size={16} color={colors.saffron || '#FF7A3A'} style={styles.warningIcon} />
                    <Text style={styles.warningText}>
                      {buildProgressHintText(freeDeliveryProgress, {
                        includeWorth: true,
                        suffix: ` to unlock Free Delivery (₹${bill.deliveryCharge} delivery fee currently applied).`,
                      })}
                    </Text>
                  </View>
                )}
              </>
            ) : (
              <Text style={styles.calcText}>Add items to view total.</Text>
            )}
          </View>
        </Animated.View>

        {/* Global Error Banner */}
        {submitError && (
          <View style={styles.errorBanner}>
            <AppIcon name="delete" size={16} color={colors.error} style={{ marginRight: spacing.sm }} />
            <Text style={styles.errorBannerText}>{submitError}</Text>
          </View>
        )}

      </ScrollView>

      {/* Bottom Action Bar */}
      <View style={[styles.bottomBar, { paddingBottom: spacing.lg + insets.bottom }]}>
        {shopStatus === 'closed' ? (
          <View style={[styles.customPlaceOrderBtn, styles.customPlaceOrderBtnDisabled]}>
            <Text style={styles.placeOrderBtnTextDisabled}>Shop is Closed</Text>
          </View>
        ) : !deliveryAvailable ? (
          <View style={[styles.customPlaceOrderBtn, styles.customPlaceOrderBtnDisabled]}>
            <Text style={styles.placeOrderBtnTextDisabled}>Delivery Unavailable</Text>
          </View>
        ) : (
          <PressableScale
          onPress={handlePlaceOrder}
          disabled={isPlaceOrderDisabled || shopStatus === 'closed' || !deliveryAvailable}
          style={[
            styles.customPlaceOrderBtn,
            (isPlaceOrderDisabled || shopStatus === 'closed' || !deliveryAvailable) && styles.customPlaceOrderBtnDisabled
          ]}
          scaleTo={0.96}
          accessibilityRole="button"
          accessibilityLabel={bill ? `Place Order, ₹${bill.grandTotal}` : 'Place Order'}
        >
          <View style={styles.placeOrderBtnContent}>
            {isSubmitting || isCalculating ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : null}
            <Text style={(isPlaceOrderDisabled || shopStatus === 'closed' || !deliveryAvailable) ? styles.placeOrderBtnTextDisabled : styles.placeOrderBtnText}>
              {placeOrderLabel}
            </Text>
            {!isSubmitting && !isCalculating && (
              <Animated.View style={[styles.placeOrderBtnArrow, { transform: [{ translateX: arrowAnim }] }]}>
                <AppIcon name="chevronRight" size={16} color={(isPlaceOrderDisabled || shopStatus === 'closed' || !deliveryAvailable) ? colors.textDisabled : '#FFFFFF'} />
              </Animated.View>
            )}
          </View>
          </PressableScale>
        )}
        <TouchableOpacity 
          style={styles.backToCartBtn}
          onPress={() => navigation.goBack()}
          disabled={isSubmitting}
        >
          <Text style={styles.backToCartText}>Back to Cart</Text>
        </TouchableOpacity>
      </View>

    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgApp,
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxxl,
  },
  section: {
    backgroundColor: colors.bgSurface,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    ...shadows.sm,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  sectionSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  addressInput: {
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  optionList: {
    gap: spacing.sm,
  },
  optionRow: {
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.bgApp,
    overflow: 'hidden',
  },
  optionRowActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  optionRowDisabled: {
    opacity: 0.5,
  },
  optionRowPressable: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 64,
    width: '100%',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
  },
  optionIconBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
    backgroundColor: colors.primaryLight,
  },
  optionIconBadgeActive: {
    backgroundColor: colors.primary,
  },
  optionTextWrap: {
    flex: 1,
  },
  optionTitle: {
    ...typography.label,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  optionSubtitle: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: 2,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  radioOuterActive: {
    borderColor: colors.primary,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.primary,
  },
  gpsContainer: {
    marginTop: spacing.md,
  },
  gpsLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  gpsLoadingText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  gpsSuccess: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.successLight,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.success + '40',
  },
  gpsSuccessIconFrame: {
    marginRight: spacing.sm,
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.success + '1A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gpsSuccessText: {
    ...typography.labelLarge,
    color: colors.success,
    fontWeight: '600',
  },
  gpsAddressText: {
    ...typography.body,
    color: colors.textPrimary,
    marginTop: 2,
  },
  gpsCoords: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  mapActionBtn: {
    backgroundColor: colors.bgSurface,
    width: 34,
    height: 30,
    borderRadius: radius.xs,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gpsErrorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.errorLight,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.error + '40',
    marginTop: spacing.sm,
  },
  gpsErrorText: {
    ...typography.caption,
    color: colors.error,
    flex: 1,
  },
  gpsRetryBtn: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
  },
  gpsRetryText: {
    ...typography.caption,
    color: colors.error,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  paymentOptions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  deliveryTypeRow: {
    flexDirection: 'column',
    gap: spacing.sm,
  },
  deliveryTypeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.bgApp,
    gap: spacing.sm,
  },
  deliveryTypeCardActive: {
    borderColor: colors.primary,
    backgroundColor: '#F0F4FF',
  },
  deliveryTypeCardFast: {
    borderColor: '#FFD700',
    backgroundColor: '#FFFDF0',
  },
  deliveryTypeCardFastActive: {
    borderColor: '#FF8C00',
    backgroundColor: '#FFF3D0',
  },
  deliveryTypeInfo: {
    flex: 1,
  },
  deliveryTypeEmoji: {
    fontSize: 22,
  },
  deliveryTypeCheck: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deliveryTypeCheckFast: {
    backgroundColor: '#FF8C00',
  },
  deliveryTypeCheckText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  deliveryTypeTitle: {
    ...typography.label,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  deliveryTypeTitleActive: {
    color: colors.primary,
  },
  deliveryTypeTitleFast: {
    ...typography.label,
    color: '#CC7700',
    fontWeight: '700',
  },
  deliveryTypeTitleFastActive: {
    color: '#FF8C00',
  },
  deliveryTypeTime: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: 2,
  },
  deliveryTypePrice: {
    ...typography.labelLarge,
    color: colors.textPrimary,
    fontWeight: '800',
  },
  deliveryTypePriceActive: {
    color: colors.primary,
  },
  deliveryTypePriceFast: {
    ...typography.labelLarge,
    color: '#CC7700',
    fontWeight: '800',
  },
  deliveryTypePriceFastActive: {
    color: '#FF8C00',
  },
  paymentBox: {
    flex: 1,
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.bgApp,
  },
  paymentBoxActive: {
    borderColor: colors.success,
    backgroundColor: colors.successLight,
  },
  paymentBoxDisabled: {
    borderColor: colors.border,
    backgroundColor: colors.bgDisabled,
    opacity: 0.6,
  },
  paymentIcon: {
    marginBottom: spacing.xs,
  },
  paymentText: {
    ...typography.label,
    color: colors.textSecondary,
  },
  paymentTextActive: {
    color: colors.success,
    fontWeight: '700',
  },
  paymentTextDisabled: {
    color: colors.textDisabled,
  },
  paymentBlockedHint: {
    ...typography.caption,
    color: colors.textDisabled,
    marginTop: spacing.xs,
    fontStyle: 'italic',
  },
  nightNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: (colors.saffronLight || '#FFF2EB'),
    borderColor: (colors.saffron || '#FF7A3A') + '40',
    borderWidth: 1.5,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  nightNoticeText: {
    ...typography.caption,
    color: colors.saffronDark || '#E05A1A',
    flex: 1,
    fontWeight: '600',
  },
  paymentPendingNote: {
    ...typography.caption,
    color: colors.textTertiary,
    fontStyle: 'italic',
  },
  upiPanel: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.infoLight,
    borderWidth: 1.5,
    borderColor: colors.info + '22',
    ...shadows.sm,
  },
  upiPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  upiIconFrame: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: colors.successLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.success + '33',
  },
  upiTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    fontWeight: '800',
  },
  upiSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  upiAmountCard: {
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  upiQrWrap: {
    alignItems: 'center',
  },
  qrShell: {
    width: 190,
    height: 190,
    borderRadius: radius.xl,
    padding: spacing.xs,
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    ...shadows.sm,
  },
  qrImage: {
    width: '100%',
    height: '100%',
    borderRadius: radius.lg,
  },
  qrPlaceholder: {
    flex: 1,
    borderRadius: radius.lg,
    backgroundColor: colors.bgInput,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.sm,
  },
  qrPlaceholderText: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  upiAmountLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  upiAmountValue: {
    ...typography.h2,
    color: colors.success,
    fontWeight: '900',
    marginTop: 2,
  },
  upiIdPill: {
    width: '100%',
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.success + '24',
    alignItems: 'center',
  },
  upiIdLabel: {
    ...typography.caption,
    color: colors.textTertiary,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  upiIdValue: {
    ...typography.label,
    color: colors.textPrimary,
    fontWeight: '800',
    marginTop: 2,
    textAlign: 'center',
  },
  screenshotNote: {
    marginTop: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.successLight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  screenshotNoteText: {
    ...typography.caption,
    color: colors.successDark,
    flex: 1,
    fontWeight: '700',
  },
  summaryBox: {
    backgroundColor: colors.bgApp,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    ...typography.body,
    color: colors.textSecondary,
  },
  summaryValue: {
    ...typography.body,
    color: colors.textPrimary,
  },
  freeDeliveryValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  summaryStrikethrough: {
    ...typography.body,
    color: colors.textSecondary,
    textDecorationLine: 'line-through',
  },
  freeDeliveryText: {
    color: colors.success,
    fontWeight: '700',
  },
  calcText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  calcErrorText: {
    ...typography.body,
    color: colors.error,
  },

  deliveryStatusText: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  deliveryStatusError: {
    color: colors.error,
  },
  deliveryStatusSuccess: {
    color: colors.success,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.xs,
  },
  summaryTotalLabel: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  summaryTotalValue: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  warningBox: {
    marginTop: spacing.md,
    backgroundColor: colors.saffronLight || '#FFF2EB',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.saffron || '#FF7A3A',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  warningIcon: {
    marginRight: 2,
  },
  warningText: {
    ...typography.labelSmall,
    color: colors.saffronDark || '#E05A1A',
    flex: 1,
    lineHeight: 16,
  },
  warningHighlight: {
    fontWeight: '800',
    color: colors.saffronDark || '#E05A1A',
  },
  errorBanner: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.errorLight,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.error + '40',
    flexDirection: 'row',
    alignItems: 'center',
  },
  errorBannerText: {
    ...typography.body,
    color: colors.error,
    flex: 1,
  },
  bottomBar: {
    backgroundColor: colors.bgSurface,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    ...shadows.xl,
  },
  customPlaceOrderBtn: {
    height: 52,
    backgroundColor: colors.success || '#1FB574',
    borderRadius: radius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.sm,
  },
  customPlaceOrderBtnDisabled: {
    backgroundColor: colors.bgDisabled || '#DFE2E6',
  },
  placeOrderBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  placeOrderBtnText: {
    ...typography.buttonLarge,
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
  placeOrderBtnTextDisabled: {
    ...typography.buttonLarge,
    color: colors.textDisabled,
    fontWeight: '800',
    fontSize: 15,
  },
  placeOrderBtnArrow: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  backToCartBtn: {
    alignItems: 'center',
    paddingVertical: spacing.xs,
    marginTop: spacing.md,
  },
  backToCartText: {
    ...typography.label,
    color: colors.textSecondary,
  },
});
