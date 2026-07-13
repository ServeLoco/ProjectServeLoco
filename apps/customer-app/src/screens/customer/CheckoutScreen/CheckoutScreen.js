import React, { useState, useEffect, useMemo, useRef, useCallback, memo } from 'react';
import { Image as ExpoImage } from 'expo-image';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Animated,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  Alert,
  LayoutAnimation,
  Platform,
  KeyboardAvoidingView,
  AppState,
} from 'react-native';
import * as Location from 'expo-location';
import { CommonActions, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AppScreen,
  AppHeader,
  AppIcon,
  PressableScale,
  LoadingSkeleton,
  ConfirmModal,
  LocationPicker,
} from '../../../components';
import { colors, typography, spacing, radius, shadows } from '../../../theme';
import { useCartStore, useSettingsStore, useAuthStore } from '../../../stores';
import { cartApi, ordersApi, imagesApi, settingsApi } from '../../../api';
import { trackEvent } from '../../../api/analyticsClient';
import { asArray, buildProgressHintText, imageRecordToUrl, normalizeCartCalculation, normalizeOrder, normalizeSettings } from '../../../utils';
import { isCodBlockedDuringNight } from '../../../utils/nightDelivery';
import { formatEtaMinutes } from '../../../utils/formatEta';
import { uuidv4 } from '../../../utils/uuid';
import {
  requestPreciseLocationPermission,
  openAppLocationSettings,
} from '../../../hooks/usePreciseLocationPermissionOnStart';

const isCodNightBlockError = (message = '') => {
  const lower = String(message).toLowerCase();
  return lower.includes('cash on delivery') && (lower.includes('night') || lower.includes('upi'));
};

const GPS_ERROR_TIMEOUT = 'GPS_TIMEOUT';
const GPS_ERROR_DENIED = 'GPS_DENIED';
const GPS_ERROR_SETTINGS = 'GPS_SETTINGS';

const GPS_TIMEOUT_MS = 8000;

// GPS can hang indefinitely on some devices; cap it so the pin/status never
// gets stuck loading forever.
function getCurrentPositionWithTimeout() {
  return Promise.race([
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(GPS_ERROR_TIMEOUT)), GPS_TIMEOUT_MS),
    ),
  ]);
}

const getGpsErrorCopy = (code) => {
  switch (code) {
    case GPS_ERROR_TIMEOUT:
      return {
        title: "Couldn't get your location",
        detail: 'GPS timed out.',
      };
    case GPS_ERROR_SETTINGS:
      return {
        title: 'Location blocked',
        detail: 'Open Settings → Permissions → Location → Allow (Precise).',
      };
    case GPS_ERROR_DENIED:
      return {
        title: 'Location permission denied',
        detail: 'Allow location access to pin your delivery address.',
      };
    default:
      return {
        title: "Couldn't get your location",
        detail: typeof code === 'string' && code ? code : 'Something went wrong. Please try again.',
      };
  }
};

const manualAddressStyles = StyleSheet.create({
  wrap: {
    marginTop: spacing.sm,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  labelIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.saffronLight,
    borderWidth: 1,
    borderColor: colors.saffron + '35',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    ...typography.labelSmall,
    color: colors.textPrimary,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  fieldWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    backgroundColor: colors.bgInput,
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.textPrimary,
  },
  fieldWrapFocused: {
    backgroundColor: colors.bgSurface,
    borderWidth: 1.5,
    borderColor: colors.saffron,
    shadowColor: colors.saffron,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 4,
  },
  fieldWrapFilled: {
    backgroundColor: colors.bgSurface,
    borderColor: colors.textPrimary,
  },
  leadingIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leadingIconActive: {
    backgroundColor: colors.saffronLight,
    borderColor: colors.saffron + '55',
  },
  input: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textPrimary,
    fontWeight: '500',
    paddingVertical: Platform.OS === 'android' ? 12 : 14,
    margin: 0,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  clearBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.bgSurface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.xs,
  },
  clearBtnHidden: {
    opacity: 0,
    pointerEvents: 'none',
  },
});

const ManualAddressField = memo(function ManualAddressField({
  visible,
  value,
  onChangeText,
  onClear,
  onTouch,
}) {
  const [focused, setFocused] = useState(false);
  const inputRef = useRef(null);
  const hasText = value.trim().length > 0;
  const iconActive = focused || hasText;

  const focusInput = useCallback(() => {
    onTouch?.();
    setTimeout(() => {
      if (inputRef.current?.isFocused?.()) {
        inputRef.current?.blur();
        setTimeout(() => {
          inputRef.current?.focus();
        }, 40);
      } else {
        inputRef.current?.focus();
      }
    }, 30);
  }, [onTouch]);

  if (!visible) {
    return null;
  }

  return (
    <View style={manualAddressStyles.wrap} collapsable={false}>
      <View style={manualAddressStyles.labelRow} pointerEvents="none">
        <View style={manualAddressStyles.labelIcon}>
          <AppIcon name="location" size={13} color={colors.textPrimary} />
        </View>
        <Text style={manualAddressStyles.label}>Complete Address</Text>
      </View>

      <Pressable
        style={[
          manualAddressStyles.fieldWrap,
          focused && manualAddressStyles.fieldWrapFocused,
          !focused && hasText && manualAddressStyles.fieldWrapFilled,
        ]}
        onPressIn={focusInput}
        android_disableSound
        accessibilityLabel="Complete address"
      >
        <View
          style={[manualAddressStyles.leadingIcon, iconActive && manualAddressStyles.leadingIconActive]}
          pointerEvents="none"
        >
          <AppIcon
            name="home"
            size={16}
            color={iconActive ? colors.textPrimary : colors.textSecondary}
          />
        </View>
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          placeholder="House No, Building, Street, Area"
          placeholderTextColor={colors.textHint}
          onFocus={() => {
            onTouch?.();
            setFocused(true);
          }}
          onBlur={() => setFocused(false)}
          style={manualAddressStyles.input}
          autoCapitalize="sentences"
          autoCorrect={false}
          returnKeyType="done"
          blurOnSubmit={false}
          underlineColorAndroid="transparent"
          showSoftInputOnFocus
        />
        {hasText ? (
          <TouchableOpacity
            style={manualAddressStyles.clearBtn}
            onPress={onClear}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Clear address"
          >
            <AppIcon name="close" size={14} color={colors.textSecondary} />
          </TouchableOpacity>
        ) : null}
      </Pressable>
    </View>
  );
});

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

  const codNightWindowLabel = nightChargeStart && nightChargeEnd
    ? `${nightChargeStart} to ${nightChargeEnd}`
    : 'night hours';
  const codNightModalMessage = `Cash on Delivery is not available during night delivery hours (${codNightWindowLabel}). Please select UPI payment to place your order.`;

  // Form State
  const [address, setAddress] = useState(userProfile?.address || '');
  const [coordinates, setCoordinates] = useState(null);
  const [gpsStatus, setGpsStatus] = useState('idle'); // idle | loading | success | error
  const [gpsError, setGpsError] = useState(null);
  // How the user is providing their delivery address: GPS or manual entry.
  // Always starts unselected — address may still be prefilled as a convenience.
  const [locationMode, setLocationMode] = useState(null);
  // Disables the page ScrollView while a finger is on the inline map so
  // pinch-to-zoom reaches the native MapView instead of being stolen by
  // the outer scroll gesture. Uses setNativeProps (not state) — a state
  // + re-render round trip is too slow to beat the native scroll
  // responder, which starts claiming the gesture on the very first
  // touchmove.
  const scrollRef = useRef(null);
  const lockMapScroll = useCallback(() => {
    scrollRef.current?.setNativeProps?.({ scrollEnabled: false });
  }, []);
  const unlockMapScroll = useCallback(() => {
    scrollRef.current?.setNativeProps?.({ scrollEnabled: true });
  }, []);
  const [paymentMethod, setPaymentMethod] = useState(null); // UPI | Cash
  const [deliveryType, setDeliveryType] = useState(null); // standard | fast

  // Submission State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [showCodNightModal, setShowCodNightModal] = useState(false);
  const showCodNightWarning = () => {
    setSubmitError(null);
    setShowCodNightModal(true);
  };
  const handleSwitchToUpi = () => {
    setPaymentMethod('UPI');
    setShowCodNightModal(false);
    setSubmitError(null);
  };
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
    delivery_type: deliveryType || 'standard',
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
  const addressTouchedRef = useRef(false);
  // 0 -> 1 selected-state progress per delivery-mode row, driving the badge
  // fill, row border/background, and radio-dot animations together.
  const gpsRowProgress = useRef(new Animated.Value(0)).current;
  const manualRowProgress = useRef(new Animated.Value(0)).current;

  // Profile has no saved address — fall back to the address on the user's
  // most recent order so they don't have to retype it from scratch.
  useEffect(() => {
    if (userProfile?.address) return;

    ordersApi.getOrders({ limit: 1 })
      .then(response => {
        if (addressTouchedRef.current) return;
        const lastOrder = asArray(response, ['orders']).map(normalizeOrder)[0];
        if (lastOrder?.address) {
          setAddress(lastOrder.address);
        }
      })
      .catch(() => {});
    // Only ever needed once, right after mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Synchronous double-submit guard. React state is async, so isSubmitting alone
  // does not protect against a fast double-tap on Place Order.
  const isSubmittingRef = useRef(false);
  const orderPlacedRef = useRef(false);

  // Analytics: checkout_start on mount, checkout_abandon on unmount if no order
  // was placed. Fire-and-forget — never blocks the checkout flow.
  useEffect(() => {
    trackEvent('checkout_start');
    return () => {
      if (!orderPlacedRef.current) trackEvent('checkout_abandon');
    };
  }, []);

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

  // If the admin disables fast delivery, clear a stale fast selection.
  useEffect(() => {
    if (deliveryType === 'fast' && bill && bill.fastDeliveryEnabled === false) {
      setDeliveryType(null);
    }
  }, [bill, deliveryType]);

  // If the current time is inside the night delivery window, COD is unavailable
  // and we force the user to UPI.
  useEffect(() => {
    if (codBlockedByNight && paymentMethod === 'Cash') {
      setPaymentMethod('UPI');
    }
  }, [codBlockedByNight, paymentMethod]);

  // Always refresh payment settings on checkout — the home screen caches them
  // for up to 5 minutes, so a newly uploaded UPI QR would otherwise stay hidden.
  useEffect(() => {
    let isActive = true;

    settingsApi.getSettings()
      .then((response) => {
        if (!isActive) return;
        setSettings(normalizeSettings(response));
      })
      .catch(() => {});

    return () => {
      isActive = false;
    };
  }, [setSettings]);

  useEffect(() => {
    if (upiQrImageUrl || !upiQrImageId) return undefined;

    let isActive = true;

    imagesApi.getImage(upiQrImageId)
      .then(response => {
        const image = response?.data || response?.image || response;
        const imageUrl = imageRecordToUrl(image);
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
            toValue: 1.12,
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

  // Apply coordinates chosen on the LocationPicker (reverse-geocode once per confirm).
  const applyPickedLocation = async (latitude, longitude) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setGpsStatus('loading');
    setGpsError(null);

    try {
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

  // If denied at app start, re-ask when Checkout opens.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await requestPreciseLocationPermission();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // After user enables Location in Settings and returns, clear the blocked state.
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (next) => {
      if (next !== 'active') return;
      try {
        const existing = await Location.getForegroundPermissionsAsync();
        if (existing?.granted) {
          setGpsError(null);
          if (gpsStatus === 'error') setGpsStatus('idle');
        }
      } catch (_) { /* ignore */ }
    });
    return () => sub.remove();
  }, [gpsStatus]);

  // Tapping the "Current Location" card fetches + pins the position
  // immediately — the inline map (rendered under the option cards) shows it
  // live, no separate "use current location" tap required.
  const openLocationPicker = async () => {
    setGpsError(null);
    // Re-ask system dialog when possible; if permanently blocked, send to Settings.
    const result = await requestPreciseLocationPermission();
    if (!result.granted) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setGpsStatus('error');
      if (result.needsSettings) {
        setGpsError(GPS_ERROR_SETTINGS);
        // Deep-link into app settings so they can flip Location → Allow.
        openAppLocationSettings();
      } else {
        setGpsError(GPS_ERROR_DENIED);
      }
      // Inline map still renders with the default center; pan-and-confirm
      // and "use my current location" retry remain available there.
      return;
    }

    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    try {
      const position = await getCurrentPositionWithTimeout();
      await applyPickedLocation(position.coords.latitude, position.coords.longitude);
    } catch (error) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setGpsStatus('error');
      setGpsError(error.message === GPS_ERROR_TIMEOUT ? GPS_ERROR_TIMEOUT : error.message);
    }
  };

  const selectMode = (mode) => {
    // Tapping the already-selected GPS card again is treated as "retry".
    if (mode === locationMode) {
      if (mode === 'gps') openLocationPicker();
      return;
    }

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

    if (mode === 'gps') {
      openLocationPicker();
    }
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
          delivery_type: deliveryType || 'standard',
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
      orderPlacedRef.current = true;
      trackEvent('order_placed', { orderId: Number(orderId) || undefined });
      // Order created successfully — clear the key so a future checkout
      // session generates a fresh one.
      idempotencyKeyRef.current = null;
    } catch (error) {
      const message = error.message || 'Unable to place order. Please try again.';
      if (isCodNightBlockError(message)) {
        showCodNightWarning();
      } else {
        setSubmitError(message);
      }
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
    if (!locationMode) {
      setSubmitError('Please choose how to provide your delivery address');
      return;
    }
    if (!address.trim()) {
      setSubmitError('Please enter a delivery address');
      return;
    }
    if (!paymentMethod) {
      setSubmitError('Please select a payment method');
      return;
    }
    if (bill?.fastDeliveryEnabled && !deliveryType) {
      setSubmitError('Please select a delivery speed');
      return;
    }
    if (shopStatus === 'closed') {
      setSubmitError('The shop is currently closed. We cannot accept orders right now.');
      return;
    }
    if (codBlockedByNight && paymentMethod === 'Cash') {
      showCodNightWarning();
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
      const message = error.message || 'Unable to place order. Please try again.';
      if (isCodNightBlockError(message)) {
        showCodNightWarning();
      } else {
        setSubmitError(message);
      }
      isSubmittingRef.current = false;
      setIsSubmitting(false);
      Animated.spring(btnScale, { toValue: 1, useNativeDriver: true }).start();
    }
  };

  const freeDeliveryProgress = bill?.freeDeliveryProgress || null;
  const totalQuantity = items.reduce((total, item) => total + (Number(item.quantity) || 0), 0);
  // Location is now optional - removed delivery validation checks
  const handleAddressTouch = useCallback(() => {
    addressTouchedRef.current = true;
  }, []);

  const handleAddressChange = useCallback((text) => {
    addressTouchedRef.current = true;
    setAddress(text);
    setSubmitError(prev => (prev ? null : prev));
  }, []);

  const handleAddressClear = useCallback(() => {
    addressTouchedRef.current = true;
    setAddress('');
    setSubmitError(prev => (prev ? null : prev));
  }, []);

  const isModeSelectDisabled = isSubmitting || items.length === 0 || gpsStatus === 'loading';
  const gpsErrorCopy = gpsStatus === 'error' ? getGpsErrorCopy(gpsError) : null;
  const isPlaceOrderDisabled = isSubmitting || isCalculating || items.length === 0 || !bill || Boolean(calcError);
  const placeOrderLabel = isSubmitting
    ? 'Processing...'
    : isCalculating
    ? 'Calculating total...'
    : bill
    ? `Place Order • ₹${bill.grandTotal}`
    : 'Place Order';

  return (
    <AppScreen style={styles.container} safeAreaBottom={false}>
      <AppHeader
        title="Checkout"
        onBack={() => navigation.goBack()}
      />

      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
        keyboardDismissMode="none"
        nestedScrollEnabled
      >
        
        {/* Delivery Details */}
        <View style={styles.deliverySection}>
          <Animated.View style={{ transform: [{ translateY: deliverySlide }] }}>
          <View style={styles.deliverySectionHeader}>
            <View style={styles.deliverySectionIconWrap}>
              <AppIcon name="location" size={16} color={colors.textPrimary} />
            </View>
            <View style={styles.deliverySectionHeaderText}>
              <Text style={styles.deliverySectionTitle}>Delivery Details</Text>
              <Text style={styles.deliverySectionSubtitle}>How should we get your delivery address?</Text>
            </View>
          </View>

          <View style={styles.outsideCityWarning}>
            <AppIcon name="warning" size={16} color={colors.error} />
            <Text style={styles.outsideCityWarningText}>
              Orders outside Gorakhpur will be cancelled automatically.
            </Text>
          </View>

          <View style={styles.optionPicker}>
            <View style={styles.optionCardRow}>
              <View style={styles.optionColumn}>
                <View style={styles.optionPillSlot}>
                  <View style={styles.recommendPill}>
                    <Text style={styles.recommendPillText}>Recommend</Text>
                  </View>
                </View>
                <PressableScale
                  onPress={() => selectMode('gps')}
                  disabled={isModeSelectDisabled}
                  style={[
                    styles.optionCard,
                    styles.optionCardDelivery,
                    locationMode === 'gps' && styles.optionCardDeliveryActive,
                    isModeSelectDisabled && styles.optionCardDisabled,
                  ]}
                  scaleTo={0.98}
                  accessibilityRole="button"
                  accessibilityLabel="Use my current location"
                  accessibilityState={{ selected: locationMode === 'gps', disabled: isModeSelectDisabled }}
                >
                  {locationMode === 'gps' && (
                    <View style={[styles.optionCardActiveBadge, styles.optionCardActiveBadgeDelivery]}>
                      <AppIcon name="check" size={9} color={colors.textInverse} />
                    </View>
                  )}
                  <View style={[styles.optionCardIconWrap, styles.optionCardIconWrapDelivery, locationMode === 'gps' && styles.optionCardIconWrapDeliveryActive]}>
                    <Animated.View style={{ transform: [{ scale: gpsIconScale }] }}>
                      <AppIcon
                        name="navigation"
                        size={16}
                        color={locationMode === 'gps' ? colors.textPrimary : colors.textSecondary}
                      />
                    </Animated.View>
                  </View>
                  <Text
                    numberOfLines={2}
                    style={[styles.optionCardTitle, styles.optionCardTitleDelivery, locationMode === 'gps' && styles.optionCardTitleDeliveryActive]}
                  >
                    Current Location
                  </Text>
                </PressableScale>
              </View>

              <View style={styles.optionColumn}>
                <View style={styles.optionPillSlot} />
                <PressableScale
                  onPress={() => selectMode('manual')}
                  disabled={isModeSelectDisabled}
                  style={[
                    styles.optionCard,
                    styles.optionCardDelivery,
                    locationMode === 'manual' && styles.optionCardDeliveryActive,
                    isModeSelectDisabled && styles.optionCardDisabled,
                  ]}
                  scaleTo={0.98}
                  accessibilityRole="button"
                  accessibilityLabel="Enter address manually"
                  accessibilityState={{ selected: locationMode === 'manual', disabled: isModeSelectDisabled }}
                >
                  {locationMode === 'manual' && (
                    <View style={[styles.optionCardActiveBadge, styles.optionCardActiveBadgeDelivery]}>
                      <AppIcon name="check" size={9} color={colors.textInverse} />
                    </View>
                  )}
                  <View style={[styles.optionCardIconWrap, styles.optionCardIconWrapDelivery, locationMode === 'manual' && styles.optionCardIconWrapDeliveryActive]}>
                    <Animated.View style={{ transform: [{ scale: manualIconScale }] }}>
                      <AppIcon
                        name="pencil"
                        size={16}
                        color={locationMode === 'manual' ? colors.textPrimary : colors.textSecondary}
                      />
                    </Animated.View>
                  </View>
                  <Text
                    numberOfLines={2}
                    style={[styles.optionCardTitle, styles.optionCardTitleDelivery, locationMode === 'manual' && styles.optionCardTitleDeliveryActive]}
                  >
                    Enter Manually
                  </Text>
                </PressableScale>
              </View>
            </View>
          </View>
          </Animated.View>

          {locationMode === 'gps' && (
            <View
              onTouchStart={lockMapScroll}
              onTouchEnd={unlockMapScroll}
              onTouchCancel={unlockMapScroll}
            >
            <LocationPicker
              inline
              autoConfirmOnLocate
              initialCenter={
                coordinates
                  ? { latitude: coordinates.lat, longitude: coordinates.lng }
                  : undefined
              }
              onConfirm={applyPickedLocation}
            />
            </View>
          )}

          <ManualAddressField
            visible={locationMode === 'manual'}
            value={address}
            onTouch={handleAddressTouch}
            onChangeText={handleAddressChange}
            onClear={handleAddressClear}
          />

          {locationMode === 'gps' && gpsStatus !== 'idle' && (
            <View style={styles.gpsContainer}>
              {gpsStatus === 'loading' ? (
                <View style={styles.gpsBarLoading}>
                  <View style={styles.gpsBarLoadingIcon}>
                    <ActivityIndicator size="small" color={colors.textPrimary} />
                  </View>
                  <Text style={styles.gpsBarLoadingText}>Fetching your location...</Text>
                </View>
              ) : gpsStatus === 'success' ? (
                <View style={styles.gpsBarSuccess}>
                  <Animated.View style={[styles.gpsBarIcon, { transform: [{ scale: gpsPulse }] }]}>
                    <AppIcon name="location" size={16} color={colors.successDark} />
                  </Animated.View>
                  <Text style={styles.gpsBarSuccessText}>Your live location fetched successfully</Text>
                </View>
              ) : gpsErrorCopy ? (
                <View style={styles.gpsBarError}>
                  <View style={styles.gpsBarErrorIconWrap}>
                    <AppIcon name="warning" size={12} color={colors.error} />
                  </View>
                  <View style={styles.gpsBarErrorBody}>
                    <Text style={styles.gpsBarErrorTitle}>{gpsErrorCopy.title}</Text>
                    <Text style={styles.gpsBarErrorText}>{gpsErrorCopy.detail}</Text>
                    <View style={styles.gpsBarErrorActions}>
                      {gpsError === GPS_ERROR_SETTINGS ? (
                        <PressableScale
                          onPress={() => openAppLocationSettings()}
                          disabled={gpsStatus === 'loading'}
                          style={[styles.gpsBarActionBtn, styles.gpsBarRetryBtn]}
                          scaleTo={0.97}
                          accessibilityRole="button"
                          accessibilityLabel="Open settings for location"
                        >
                          <AppIcon name="settings" size={14} color={colors.textPrimary} />
                          <Text style={styles.gpsBarRetryBtnText}>Open Settings</Text>
                        </PressableScale>
                      ) : (
                        <PressableScale
                          onPress={openLocationPicker}
                          disabled={gpsStatus === 'loading'}
                          style={[styles.gpsBarActionBtn, styles.gpsBarRetryBtn]}
                          scaleTo={0.97}
                          accessibilityRole="button"
                          accessibilityLabel="Retry getting location"
                        >
                          <AppIcon name="navigation" size={14} color={colors.textPrimary} />
                          <Text style={styles.gpsBarRetryBtnText}>Retry</Text>
                        </PressableScale>
                      )}
                    </View>
                    <Text style={styles.gpsBarErrorManualLead}>Or enter your address manually:</Text>
                    <PressableScale
                      onPress={() => selectMode('manual')}
                      disabled={isModeSelectDisabled}
                      style={[styles.gpsBarActionBtn, styles.gpsBarManualBtn]}
                      scaleTo={0.97}
                      accessibilityRole="button"
                      accessibilityLabel="Enter address manually"
                    >
                      <AppIcon name="edit" size={14} color={colors.textPrimary} />
                      <Text style={styles.gpsBarManualBtnText}>Enter Manually</Text>
                    </PressableScale>
                  </View>
                </View>
              ) : null}
            </View>
          )}
        </View>

        {/* Delivery Type Selector — shown whenever the admin has enabled fast delivery.
            Fast delivery fully replaces the standard charge, regardless of threshold/free-offer. */}
        {bill?.fastDeliveryEnabled && (
          <Animated.View style={[styles.deliverySpeedSection, { transform: [{ translateY: paymentSlide }] }]}>
            <View style={styles.deliverySpeedHeader}>
              <View style={styles.deliverySpeedIconWrap}>
                <AppIcon name="box" size={16} color={colors.textPrimary} />
              </View>
              <View style={styles.deliverySpeedHeaderText}>
                <Text style={styles.deliverySpeedTitle}>Delivery Speed</Text>
                <Text style={styles.deliverySpeedSubtitle}>Choose how fast you need it</Text>
              </View>
            </View>
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
                style={[styles.deliveryTypeCard, deliveryType === 'fast' && styles.deliveryTypeCardActive]}
                onPress={() => setDeliveryType('fast')}
                scaleTo={0.97}
                accessibilityRole="button"
                accessibilityLabel="Fast delivery"
                accessibilityState={{ selected: deliveryType === 'fast' }}
              >
                <Text style={styles.deliveryTypeEmoji}>⚡</Text>
                <View style={styles.deliveryTypeInfo}>
                  <Text numberOfLines={1} style={[styles.deliveryTypeTitle, deliveryType === 'fast' && styles.deliveryTypeTitleActive]}>Fast Delivery</Text>
                  <Text numberOfLines={1} style={styles.deliveryTypeTime}>Arrives in {formatEtaMinutes(bill.fastDeliveryMinutes) || '—'}</Text>
                </View>
                <Text numberOfLines={1} style={[styles.deliveryTypePrice, deliveryType === 'fast' && styles.deliveryTypePriceActive]}>
                  ₹{bill.fastDeliveryCharge}
                </Text>
                {deliveryType === 'fast' && (
                  <View style={styles.deliveryTypeCheck}><Text style={styles.deliveryTypeCheckText}>✓</Text></View>
                )}
              </PressableScale>
            </View>
          </Animated.View>
        )}

        {/* Payment Method */}
        <View style={styles.paymentSection}>
          <Animated.View style={{ transform: [{ translateY: paymentSlide }] }}>
            <View style={styles.paymentSectionHeader}>
              <View style={styles.paymentSectionIconWrap}>
                <AppIcon name="creditCard" size={16} color={colors.textPrimary} />
              </View>
              <View style={styles.paymentSectionHeaderText}>
                <Text style={styles.paymentSectionTitle}>Payment Method</Text>
                <Text style={styles.paymentSectionSubtitle}>How would you like to pay?</Text>
              </View>
            </View>

            {codBlockedByNight && (
              <View style={styles.paymentNightBar}>
                <AppIcon name="clock" size={14} color={colors.textSecondary} />
                <Text style={styles.paymentNightBarText}>
                  COD unavailable {nightChargeStart || '—'}–{nightChargeEnd || '—'}. Use UPI.
                </Text>
              </View>
            )}

            <View style={styles.optionPicker}>
              <View style={styles.optionCardRow}>
                <View style={styles.optionColumn}>
                  <View style={styles.optionPillSlot}>
                    <View style={styles.recommendPill}>
                      <Text style={styles.recommendPillText}>
                        {codBlockedByNight ? 'Recommend' : 'Popular'}
                      </Text>
                    </View>
                  </View>
                  <PressableScale
                    onPress={() => setPaymentMethod('UPI')}
                    style={[
                      styles.optionCard,
                      styles.paymentCard,
                      paymentMethod === 'UPI' && styles.paymentCardActive,
                    ]}
                    scaleTo={0.98}
                    accessibilityRole="button"
                    accessibilityLabel="UPI / Online"
                    accessibilityState={{ selected: paymentMethod === 'UPI' }}
                  >
                    {paymentMethod === 'UPI' && (
                      <View style={[styles.optionCardActiveBadge, styles.paymentCardBadge]}>
                        <AppIcon name="check" size={9} color={colors.textInverse} />
                      </View>
                    )}
                    <View
                      style={[
                        styles.optionCardIconWrap,
                        styles.paymentCardIconWrap,
                        paymentMethod === 'UPI' && styles.paymentCardIconWrapActive,
                      ]}
                    >
                      <AppIcon
                        name="creditCard"
                        size={16}
                        color={paymentMethod === 'UPI' ? colors.textPrimary : colors.textSecondary}
                      />
                    </View>
                    <Text
                      numberOfLines={2}
                      style={[
                        styles.optionCardTitle,
                        styles.paymentCardTitle,
                        paymentMethod === 'UPI' && styles.paymentCardTitleActive,
                      ]}
                    >
                      UPI / Online
                    </Text>
                  </PressableScale>
                </View>

                <View style={styles.optionColumn}>
                  <View style={styles.optionPillSlot} />
                  <PressableScale
                    onPress={() => {
                      if (!codBlockedByNight) setPaymentMethod('Cash');
                    }}
                    disabled={codBlockedByNight}
                    style={[
                      styles.optionCard,
                      styles.paymentCard,
                      paymentMethod === 'Cash' && !codBlockedByNight && styles.paymentCardActive,
                      codBlockedByNight && styles.optionCardDisabled,
                    ]}
                    scaleTo={codBlockedByNight ? 1 : 0.98}
                    accessibilityRole="button"
                    accessibilityLabel="Cash on Delivery"
                    accessibilityState={{ disabled: codBlockedByNight, selected: paymentMethod === 'Cash' && !codBlockedByNight }}
                  >
                    {paymentMethod === 'Cash' && !codBlockedByNight && (
                      <View style={[styles.optionCardActiveBadge, styles.paymentCardBadge]}>
                        <AppIcon name="check" size={9} color={colors.textInverse} />
                      </View>
                    )}
                    <View
                      style={[
                        styles.optionCardIconWrap,
                        styles.paymentCardIconWrap,
                        paymentMethod === 'Cash' && !codBlockedByNight && styles.paymentCardIconWrapActive,
                      ]}
                    >
                      <AppIcon
                        name="rupee"
                        size={16}
                        color={
                          codBlockedByNight
                            ? colors.textDisabled
                            : paymentMethod === 'Cash'
                            ? colors.textPrimary
                            : colors.textSecondary
                        }
                      />
                    </View>
                    <Text
                      numberOfLines={2}
                      style={[
                        styles.optionCardTitle,
                        styles.paymentCardTitle,
                        paymentMethod === 'Cash' && !codBlockedByNight && styles.paymentCardTitleActive,
                        codBlockedByNight && styles.paymentCardTitleDisabled,
                      ]}
                    >
                      Cash on Delivery
                    </Text>
                    {codBlockedByNight && (
                      <Text style={styles.paymentCardHint}>Unavailable at night</Text>
                    )}
                  </PressableScale>
                </View>
              </View>
            </View>

            {paymentMethod === 'UPI' && (
              <Text style={styles.paymentMethodNote}>Complete UPI payment before placing your order.</Text>
            )}
            {paymentMethod === 'Cash' && (
              <Text style={styles.paymentMethodNote}>Pay cash to the delivery executive.</Text>
            )}
            {!paymentMethod && (
              <Text style={styles.paymentMethodNote}>Select how you would like to pay.</Text>
            )}

            {paymentMethod === 'UPI' && (
              <View style={styles.upiBlock}>
                <View style={styles.upiBlockHeader}>
                  <AppIcon name="creditCard" size={16} color={colors.textPrimary} />
                  <View style={styles.upiBlockHeaderText}>
                    <Text style={styles.upiBlockTitle}>Complete UPI Payment</Text>
                    <Text style={styles.upiBlockSubtitle}>
                      Scan with PhonePe, GPay, Paytm, or any UPI app
                    </Text>
                  </View>
                </View>

                <View style={styles.upiAmountRow}>
                  <Text style={styles.upiAmountLabel}>Amount to pay</Text>
                  <Text style={styles.upiAmountValue}>
                    {isCalculating ? '...' : bill ? `₹${bill.grandTotal}` : '—'}
                  </Text>
                </View>

                <View style={styles.upiQrBlock}>
                  <Text style={styles.upiQrBlockLabel}>Merchant QR Code</Text>
                  <View style={styles.qrFrame}>
                    <View style={[styles.qrCorner, styles.qrCornerTL]} />
                    <View style={[styles.qrCorner, styles.qrCornerTR]} />
                    <View style={[styles.qrCorner, styles.qrCornerBL]} />
                    <View style={[styles.qrCorner, styles.qrCornerBR]} />
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
                          <View style={styles.qrPlaceholderIconWrap}>
                            <AppIcon name="image" size={22} color={colors.textTertiary} />
                          </View>
                          <Text style={styles.qrPlaceholderTitle}>QR not uploaded</Text>
                          <Text style={styles.qrPlaceholderText}>
                            Ask the shop to add a UPI QR in admin settings
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                </View>

                <View style={styles.upiStepsRow}>
                  <View style={styles.upiStep}>
                    <View style={styles.upiStepBadge}>
                      <Text style={styles.upiStepBadgeText}>1</Text>
                    </View>
                    <Text style={styles.upiStepText}>Scan QR</Text>
                  </View>
                  <View style={styles.upiStepDivider} />
                  <View style={styles.upiStep}>
                    <View style={styles.upiStepBadge}>
                      <Text style={styles.upiStepBadgeText}>2</Text>
                    </View>
                    <Text style={styles.upiStepText}>Pay amount</Text>
                  </View>
                  <View style={styles.upiStepDivider} />
                  <View style={styles.upiStep}>
                    <View style={styles.upiStepBadge}>
                      <Text style={styles.upiStepBadgeText}>3</Text>
                    </View>
                    <Text style={styles.upiStepText}>Save screenshot</Text>
                  </View>
                </View>

                <View style={styles.upiAutoCancelWarning}>
                  <View style={[styles.upiNoticeIconWrap, styles.upiNoticeIconWrapWarning]}>
                    <AppIcon name="warning" size={12} color={colors.error} />
                  </View>
                  <Text style={styles.upiAutoCancelWarningText}>
                    Unpaid orders are auto-cancelled.
                  </Text>
                </View>

                <View style={styles.screenshotNote}>
                  <View style={[styles.upiNoticeIconWrap, styles.upiNoticeIconWrapSuccess]}>
                    <AppIcon name="check" size={12} color={colors.successDark} />
                  </View>
                  <Text style={styles.screenshotNoteText}>
                    Show payment screenshot to delivery boy.
                  </Text>
                </View>
              </View>
            )}
          </Animated.View>
        </View>

        {/* Order Summary */}
        <View style={styles.summarySection}>
          <Animated.View style={{ transform: [{ translateY: summarySlide }] }}>
            <View style={styles.summarySectionHeader}>
              <View style={styles.summarySectionIconWrap}>
                <AppIcon name="shoppingBag" size={16} color={colors.textPrimary} />
              </View>
              <View style={styles.summarySectionHeaderText}>
                <Text style={styles.summarySectionTitle}>Order Summary</Text>
                <Text style={styles.summarySectionSubtitle}>Review your bill breakdown</Text>
              </View>
            </View>

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
                <View style={[styles.summaryRow, styles.summaryRowFirst]}>
                  <Text style={styles.summaryLabel}>Items ({totalQuantity})</Text>
                  <Text style={styles.summaryValue}>₹{bill.subtotal}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>
                    {bill.deliveryType === 'fast' ? 'Fast Delivery' : 'Delivery Charge'}
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
                      <Text style={[styles.summaryValue, styles.summaryDiscountValue]}>- ₹{discountToShow}</Text>
                    </View>
                  );
                })()}

                {(() => {
                  const isFreeDeliveryApplied = Boolean(bill.isFreeDeliveryApplied);
                  if (!deliveryAvailable) {
                    return (
                      <View style={[styles.summaryStatusNote, styles.summaryStatusNoteError]}>
                        <Text style={[styles.deliveryStatusText, styles.deliveryStatusError]}>
                          Delivery is currently unavailable in your area.
                        </Text>
                      </View>
                    );
                  }
                  if (bill.deliveryMessage || bill.requiresLocation || !bill.deliveryWithinRange || isFreeDeliveryApplied) {
                    return (
                      <View style={[
                        styles.summaryStatusNote,
                        !bill.deliveryWithinRange && styles.summaryStatusNoteError,
                        isFreeDeliveryApplied && styles.summaryStatusNoteSuccess,
                      ]}>
                        <Text style={[
                          styles.deliveryStatusText,
                          !bill.deliveryWithinRange && styles.deliveryStatusError,
                          isFreeDeliveryApplied && styles.deliveryStatusSuccess,
                        ]}>
                          {bill.deliveryMessage || (bill.requiresLocation ? 'Pin location to continue.' : 'Delivery available.')}
                        </Text>
                      </View>
                    );
                  }
                  return null;
                })()}

                <View style={styles.summaryGrandTotalRow}>
                  <Text style={styles.summaryTotalLabel}>Total to Pay</Text>
                  <Text style={styles.summaryTotalValue}>₹{bill.grandTotal}</Text>
                </View>
              </>
            ) : (
              <Text style={styles.calcText}>Add items to view total.</Text>
            )}

            {bill && freeDeliveryProgress && (
              <View style={styles.summaryProgressNote}>
                <View style={[styles.upiNoticeIconWrap, styles.summaryProgressNoteIcon]}>
                  <AppIcon name="box" size={12} color={colors.textSecondary} />
                </View>
                <Text style={styles.summaryProgressNoteText}>
                  {buildProgressHintText(freeDeliveryProgress, {
                    includeWorth: true,
                    suffix: ` to unlock Free Delivery (₹${bill.deliveryCharge} delivery fee currently applied).`,
                  })}
                </Text>
              </View>
            )}
          </Animated.View>
        </View>

        {/* Global Error Banner */}
        {submitError && (
          <View style={styles.errorBanner}>
            <AppIcon name="delete" size={16} color={colors.error} style={{ marginRight: spacing.sm }} />
            <Text style={styles.errorBannerText}>{submitError}</Text>
          </View>
        )}

      </ScrollView>

      {/* Bottom Action Bar */}
      <View style={[styles.bottomBar, { paddingBottom: spacing.lg + insets.bottom }]} collapsable={false}>
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
      </KeyboardAvoidingView>

      <ConfirmModal
        visible={showCodNightModal}
        title="COD not available at night"
        message={codNightModalMessage}
        confirmLabel="Switch to UPI"
        cancelLabel="Cancel"
        confirmVariant="primary"
        onCancel={() => setShowCodNightModal(false)}
        onConfirm={handleSwitchToUpi}
      />

    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgApp,
  },
  keyboardAvoid: {
    flex: 1,
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
    marginBottom: spacing.xs,
  },
  deliverySection: {
    backgroundColor: colors.bgSurface,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderRadius: radius.xl,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    borderLeftWidth: 4,
    borderLeftColor: colors.saffron,
    ...shadows.card,
  },
  deliverySectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  deliverySectionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.saffronLight,
    borderWidth: 1.5,
    borderColor: colors.saffron + '35',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.xs,
  },
  deliverySectionHeaderText: {
    flex: 1,
  },
  deliverySectionTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  deliverySectionSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  deliveryInputWrap: {
    marginTop: spacing.sm,
  },
  addressFieldLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  addressFieldLabelIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.saffronLight,
    borderWidth: 1,
    borderColor: colors.saffron + '35',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addressFieldLabel: {
    ...typography.labelSmall,
    color: colors.textPrimary,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  addressFieldWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    backgroundColor: colors.bgInput,
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  addressFieldWrapFocused: {
    backgroundColor: colors.bgSurface,
    borderWidth: 1.5,
    borderColor: colors.saffron,
    shadowColor: colors.saffron,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 4,
  },
  addressFieldWrapFilled: {
    backgroundColor: colors.bgSurface,
    borderColor: colors.borderStrong,
  },
  addressFieldLeadingIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addressFieldLeadingIconFocused: {
    backgroundColor: colors.saffronLight,
    borderColor: colors.saffron + '55',
  },
  addressFieldLeadingIconFilled: {
    backgroundColor: colors.saffronLight,
    borderColor: colors.saffron + '35',
  },
  addressFieldInput: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textPrimary,
    fontWeight: '500',
    paddingVertical: 14,
    margin: 0,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  addressFieldClear: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.bgSurface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.xs,
  },
  addressFieldClearHidden: {
    opacity: 0,
  },
  optionPicker: {
    overflow: 'visible',
  },
  optionCardRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'stretch',
    overflow: 'visible',
  },
  optionColumn: {
    flex: 1,
    overflow: 'visible',
  },
  optionPillSlot: {
    minHeight: 24,
    marginBottom: spacing.xs,
    justifyContent: 'flex-start',
  },
  outsideCityWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.errorLight,
    borderWidth: 1,
    borderColor: colors.errorBorder,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginBottom: spacing.sm,
  },
  outsideCityWarningText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
    color: colors.error,
    fontWeight: '600',
  },
  recommendPill: {
    alignSelf: 'flex-start',
    backgroundColor: colors.successLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.palette.success200,
    ...shadows.xs,
  },
  recommendPillText: {
    fontSize: 9,
    lineHeight: 11,
    color: colors.successDark,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  optionCard: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minHeight: 50,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    position: 'relative',
  },
  optionCardDelivery: {
    backgroundColor: colors.bgInput,
    borderColor: colors.borderStrong,
  },
  optionCardDeliveryActive: {
    borderColor: colors.success,
    borderWidth: 2,
    backgroundColor: colors.bgSurface,
    shadowColor: colors.success,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 4,
  },
  optionCardActiveBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.bgSurface,
    zIndex: 2,
  },
  optionCardActiveBadgeDelivery: {
    backgroundColor: colors.success,
  },
  optionCardDisabled: {
    opacity: 0.5,
  },
  optionCardIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  optionCardIconWrapDelivery: {
    backgroundColor: colors.bgSurface,
    borderColor: colors.border,
  },
  optionCardIconWrapDeliveryActive: {
    backgroundColor: colors.successLight,
    borderColor: colors.success,
    borderWidth: 1.5,
  },
  optionCardTitle: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  optionCardTitleDelivery: {
    color: colors.textSecondary,
  },
  optionCardTitleDeliveryActive: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  gpsContainer: {
    marginTop: spacing.sm,
  },
  gpsBarLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.saffron + '35',
    backgroundColor: colors.saffronLight,
  },
  gpsBarSuccess: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.palette.success200,
    backgroundColor: colors.successLight,
  },
  gpsBarIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.bgSurface,
    borderWidth: 1.5,
    borderColor: colors.palette.success200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gpsBarSuccessText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 17,
    color: colors.successDark,
    fontWeight: '600',
  },
  gpsBarLoadingIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.bgSurface,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gpsBarLoadingText: {
    fontSize: 13,
    lineHeight: 17,
    color: colors.textPrimary,
    flex: 1,
    fontWeight: '500',
  },
  gpsBarError: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.errorBorder,
    backgroundColor: colors.errorLight,
  },
  gpsBarErrorIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.errorBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  gpsBarErrorBody: {
    flex: 1,
    flexDirection: 'column',
    gap: spacing.xs,
  },
  gpsBarErrorTitle: {
    ...typography.caption,
    color: colors.error,
    fontWeight: '700',
    lineHeight: 18,
  },
  gpsBarErrorText: {
    ...typography.caption,
    color: colors.error,
    fontWeight: '500',
    lineHeight: 18,
  },
  gpsBarErrorActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  gpsBarErrorManualLead: {
    ...typography.caption,
    color: colors.error,
    fontWeight: '500',
    lineHeight: 18,
    marginTop: spacing.xs,
  },
  gpsBarActionBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.bgSurface,
    borderWidth: 1.5,
  },
  gpsBarRetryBtn: {
    borderColor: colors.saffron,
  },
  gpsBarRetryBtnText: {
    ...typography.caption,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  gpsBarManualBtn: {
    borderColor: colors.borderStrong,
  },
  gpsBarManualBtnText: {
    ...typography.caption,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  paymentSection: {
    backgroundColor: colors.bgSurface,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderRadius: radius.xl,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    borderLeftWidth: 4,
    borderLeftColor: colors.saffron,
    ...shadows.card,
  },
  paymentSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  paymentSectionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.saffronLight,
    borderWidth: 1.5,
    borderColor: colors.saffron + '35',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.xs,
  },
  paymentSectionHeaderText: {
    flex: 1,
  },
  paymentSectionTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  paymentSectionSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  paymentNightBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    marginBottom: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  paymentNightBarText: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
    fontWeight: '600',
  },
  paymentCard: {
    backgroundColor: colors.bgInput,
    borderColor: colors.borderStrong,
  },
  paymentCardActive: {
    borderColor: colors.success,
    borderWidth: 2,
    backgroundColor: colors.bgSurface,
    shadowColor: colors.success,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 4,
  },
  paymentCardBadge: {
    backgroundColor: colors.success,
  },
  paymentCardIconWrap: {
    backgroundColor: colors.bgSurface,
    borderColor: colors.border,
  },
  paymentCardIconWrapActive: {
    backgroundColor: colors.successLight,
    borderColor: colors.success,
    borderWidth: 1.5,
  },
  paymentCardTitle: {
    color: colors.textSecondary,
  },
  paymentCardTitleActive: {
    color: colors.textPrimary,
    fontWeight: '800',
  },
  paymentCardTitleDisabled: {
    color: colors.textDisabled,
  },
  paymentCardHint: {
    fontSize: 9,
    lineHeight: 11,
    color: colors.textDisabled,
    fontWeight: '600',
    textAlign: 'center',
  },
  paymentMethodNote: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  deliverySpeedSection: {
    backgroundColor: colors.bgSurface,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderRadius: radius.xl,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    borderLeftWidth: 4,
    borderLeftColor: colors.saffron,
    ...shadows.card,
  },
  deliverySpeedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  deliverySpeedIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.saffronLight,
    borderWidth: 1.5,
    borderColor: colors.saffron + '35',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.xs,
  },
  deliverySpeedHeaderText: {
    flex: 1,
  },
  deliverySpeedTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  deliverySpeedSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
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
    borderColor: colors.saffron,
    borderWidth: 2,
    backgroundColor: colors.bgSurface,
    shadowColor: colors.saffron,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 3,
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
    backgroundColor: colors.saffron,
    alignItems: 'center',
    justifyContent: 'center',
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
    color: colors.textPrimary,
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
    color: colors.textPrimary,
  },
  upiBlock: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1.5,
    borderTopColor: colors.borderStrong,
  },
  upiBlockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  upiBlockHeaderText: {
    flex: 1,
  },
  upiBlockTitle: {
    ...typography.label,
    color: colors.textPrimary,
    fontWeight: '800',
    marginBottom: 2,
  },
  upiBlockSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  upiAmountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  upiAmountLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  upiAmountValue: {
    ...typography.h2,
    color: colors.successDark,
    fontWeight: '900',
  },
  upiQrBlock: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  upiQrBlockLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: spacing.sm,
  },
  qrFrame: {
    position: 'relative',
    padding: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrCorner: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderColor: colors.saffron,
  },
  qrCornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: 4,
  },
  qrCornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: 4,
  },
  qrCornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 4,
  },
  qrCornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 4,
  },
  qrShell: {
    width: 196,
    height: 196,
    borderRadius: radius.lg,
    padding: spacing.xs,
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.textPrimary,
    ...shadows.xs,
  },
  qrImage: {
    width: '100%',
    height: '100%',
    borderRadius: radius.md,
  },
  qrPlaceholder: {
    flex: 1,
    borderRadius: radius.md,
    backgroundColor: colors.bgInput,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
  },
  qrPlaceholderIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  qrPlaceholderTitle: {
    ...typography.labelSmall,
    color: colors.textPrimary,
    fontWeight: '700',
    textAlign: 'center',
  },
  qrPlaceholderText: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 4,
    textAlign: 'center',
    lineHeight: 16,
  },
  upiStepsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  upiStep: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  upiStepBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.saffron,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upiStepBadgeText: {
    fontSize: 11,
    lineHeight: 13,
    color: colors.textInverse,
    fontWeight: '800',
  },
  upiStepText: {
    fontSize: 10,
    lineHeight: 12,
    color: colors.textSecondary,
    fontWeight: '700',
    textAlign: 'center',
  },
  upiStepDivider: {
    width: 1,
    height: 28,
    backgroundColor: colors.border,
  },
  upiAutoCancelWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.errorBorder,
    backgroundColor: colors.errorLight,
  },
  upiAutoCancelWarningText: {
    ...typography.caption,
    color: colors.error,
    flex: 1,
    fontWeight: '700',
    lineHeight: 18,
  },
  screenshotNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.palette.success200,
    backgroundColor: colors.successLight,
  },
  upiNoticeIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upiNoticeIconWrapWarning: {
    borderColor: colors.errorBorder,
  },
  upiNoticeIconWrapSuccess: {
    borderColor: colors.palette.success200,
  },
  screenshotNoteText: {
    ...typography.caption,
    color: colors.successDark,
    flex: 1,
    fontWeight: '600',
    lineHeight: 18,
  },
  summarySection: {
    backgroundColor: colors.bgSurface,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderRadius: radius.xl,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    borderLeftWidth: 4,
    borderLeftColor: colors.saffron,
    ...shadows.card,
  },
  summarySectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  summarySectionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.saffronLight,
    borderWidth: 1.5,
    borderColor: colors.saffron + '35',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.xs,
  },
  summarySectionHeaderText: {
    flex: 1,
  },
  summarySectionTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  summarySectionSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  summaryRowFirst: {
    borderTopWidth: 0,
  },
  summaryLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  summaryValue: {
    ...typography.label,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  summaryDiscountValue: {
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
    color: colors.textPrimary,
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

  summaryStatusNote: {
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  summaryStatusNoteError: {
    backgroundColor: colors.errorLight,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
  summaryStatusNoteSuccess: {
    backgroundColor: colors.bgInput,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
  deliveryStatusText: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  deliveryStatusError: {
    color: colors.error,
    fontWeight: '600',
  },
  deliveryStatusSuccess: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  summaryGrandTotalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.sm,
    marginTop: spacing.xs,
    borderTopWidth: 1.5,
    borderTopColor: colors.borderStrong,
  },
  summaryTotalLabel: {
    ...typography.label,
    color: colors.textPrimary,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  summaryTotalValue: {
    ...typography.h2,
    color: colors.textPrimary,
    fontWeight: '900',
  },
  summaryProgressNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  summaryProgressNoteIcon: {
    borderColor: colors.borderStrong,
  },
  summaryProgressNoteText: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
    fontWeight: '600',
    lineHeight: 18,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.xs,
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
    backgroundColor: colors.success,
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
