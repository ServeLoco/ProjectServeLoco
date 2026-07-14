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
  Dimensions,
  PanResponder,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { CommonActions, useNavigation } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
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

const WIN_H = Dimensions.get('window').height;
// Default drawer height (collapsed). Raise this fraction to start the sheet higher.
// Pull up further to expand payment / summary.
const SHEET_COLLAPSED = Math.round(WIN_H * 0.40);
const SHEET_EXPANDED = Math.round(WIN_H * 0.74);
const SHEET_MID = (SHEET_COLLAPSED + SHEET_EXPANDED) / 2;

/** Rider-order-style gradient action button for the checkout sheet. */
function SheetActionBtn({ label, icon, onPress, busy, disabled, variant = 'saffron' }) {
  const grad = variant === 'success'
    ? [colors.btnSuccessStart, colors.btnSuccessEnd]
    : variant === 'ghost'
      ? null
      : [colors.btnHighlightStart, colors.btnHighlightEnd];

  if (variant === 'ghost') {
    return (
      <TouchableOpacity
        onPress={onPress}
        disabled={Boolean(busy) || disabled}
        activeOpacity={0.85}
        style={styles.sheetGhostBtn}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        {busy ? (
          <ActivityIndicator color={colors.textSecondary} />
        ) : (
          <>
            {icon ? <AppIcon name={icon} size={16} color={colors.textSecondary} /> : null}
            <Text style={styles.sheetGhostBtnText}>{label}</Text>
          </>
        )}
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={Boolean(busy) || disabled}
      activeOpacity={0.9}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <LinearGradient colors={grad} style={[styles.sheetPrimaryBtn, disabled && styles.sheetPrimaryBtnDisabled]}>
        {busy ? (
          <ActivityIndicator color={colors.textInverse} />
        ) : (
          <>
            {icon ? <AppIcon name={icon} size={18} color={colors.textInverse} /> : null}
            <Text style={styles.sheetPrimaryBtnText}>{label}</Text>
          </>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
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
  const coordinatesRef = useRef(null);
  // idle | loading | success (delivery pin confirmed) | error
  const [gpsStatus, setGpsStatus] = useState('idle');
  const [gpsError, setGpsError] = useState(null);
  // Ephemeral map popup: locating live GPS, live snap, or delivery confirmed.
  const [mapToast, setMapToast] = useState(null); // null | 'locating' | 'live' | 'pinned'
  const mapToastTimerRef = useRef(null);
  const reverseGeoTimerRef = useRef(null);
  // How the user is providing their delivery address: GPS or manual entry.
  // Page starts immersed in the map — no picker cards to tap first.
  const [locationMode, setLocationMode] = useState('gps');
  // Sheet scroll only — map is a sibling behind the sheet (no scroll conflict).
  const scrollRef = useRef(null);
  const locationPickerRef = useRef(null);
  // Draggable bottom sheet: collapsed = big map; expanded = full checkout form.
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const sheetExpandedRef = useRef(false);
  const sheetHeightAnim = useRef(new Animated.Value(SHEET_COLLAPSED)).current;
  const sheetHeightNum = useRef(SHEET_COLLAPSED);
  const sheetDragStart = useRef(SHEET_COLLAPSED);
  const scrollYRef = useRef(0);
  const [sheetReserve, setSheetReserve] = useState(SHEET_COLLAPSED);
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

  // Ephemeral map toast: locating stays until ready/error; live/pinned auto-hide.
  const showMapToast = useCallback((kind) => {
    if (mapToastTimerRef.current) {
      clearTimeout(mapToastTimerRef.current);
      mapToastTimerRef.current = null;
    }
    setMapToast(kind);
    if (kind === 'live' || kind === 'pinned') {
      mapToastTimerRef.current = setTimeout(() => {
        setMapToast(null);
        mapToastTimerRef.current = null;
      }, 1600);
    }
  }, []);

  // Confirm button / place-order commit: pin under the marker = delivery location.
  // Live GPS alone never sets delivery — only recenter moves the map to live.
  const applyPickedLocation = useCallback(async (latitude, longitude) => {
    setGpsError(null);
    setSubmitError(null);
    const next = { lat: latitude, lng: longitude };
    coordinatesRef.current = next;
    setCoordinates(next);
    setGpsStatus('success');
    showMapToast('pinned');

    if (reverseGeoTimerRef.current) {
      clearTimeout(reverseGeoTimerRef.current);
      reverseGeoTimerRef.current = null;
    }
    reverseGeoTimerRef.current = setTimeout(async () => {
      reverseGeoTimerRef.current = null;
      try {
        const places = await Location.reverseGeocodeAsync({ latitude, longitude });
        const place = places?.[0];
        if (!place) {
          setAddress((prev) => prev || `Pinned location (${latitude.toFixed(5)}, ${longitude.toFixed(5)})`);
          return;
        }
        const resolvedAddress = [place.name, place.street, place.district || place.subregion, place.city, place.region, place.postalCode]
          .filter(Boolean)
          .join(', ');
        if (resolvedAddress) setAddress(resolvedAddress);
      } catch {
        setAddress((prev) => prev || `Pinned location (${latitude.toFixed(5)}, ${longitude.toFixed(5)})`);
      }
    }, 280);
  }, [showMapToast]);

  useEffect(() => () => {
    if (mapToastTimerRef.current) clearTimeout(mapToastTimerRef.current);
    if (reverseGeoTimerRef.current) clearTimeout(reverseGeoTimerRef.current);
  }, []);

  // Recenter / auto-locate status only — does not confirm delivery pin.
  const handleLocateStatus = useCallback((status) => {
    if (status === 'loading') {
      setGpsError(null);
      showMapToast('locating');
      return;
    }
    if (status === 'ready') {
      setGpsError(null);
      showMapToast('live');
      return;
    }
    if (status === 'error') {
      setGpsStatus('error');
      setGpsError(GPS_ERROR_DENIED);
      if (mapToastTimerRef.current) {
        clearTimeout(mapToastTimerRef.current);
        mapToastTimerRef.current = null;
      }
      setMapToast(null);
    }
  }, [showMapToast]);

  // User panned or recentered — previous Confirm is invalid until they confirm again.
  const handlePinMoved = useCallback(() => {
    coordinatesRef.current = null;
    setCoordinates(null);
    setGpsStatus((prev) => (prev === 'error' ? prev : 'idle'));
  }, []);

  const snapSheet = useCallback((expanded) => {
    const h = expanded ? SHEET_EXPANDED : SHEET_COLLAPSED;
    sheetHeightNum.current = h;
    sheetExpandedRef.current = expanded;
    setSheetExpanded(expanded);
    setSheetReserve(h);
    if (!expanded) {
      scrollYRef.current = 0;
      scrollRef.current?.scrollTo?.({ y: 0, animated: false });
    }
    Animated.spring(sheetHeightAnim, {
      toValue: h,
      friction: 9,
      tension: 80,
      useNativeDriver: false,
    }).start();
  }, [sheetHeightAnim]);

  // Drag the sheet from anywhere (not only the handle). When fully expanded,
  // vertical drags at scroll-top collapse; otherwise ScrollView owns the gesture.
  const sheetPanResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, g) => {
      if (Math.abs(g.dy) < 6) return false;
      if (Math.abs(g.dy) < Math.abs(g.dx) * 1.1) return false;
      // Collapsed / mid: drag sheet up or down from any point on the drawer.
      if (!sheetExpandedRef.current) return true;
      if (sheetHeightNum.current < SHEET_EXPANDED - 4) return true;
      // Fully expanded: only claim when at top of list and pulling down to collapse.
      if (scrollYRef.current <= 2 && g.dy > 4) return true;
      return false;
    },
    onMoveShouldSetPanResponderCapture: (_, g) => {
      if (Math.abs(g.dy) < 6) return false;
      if (Math.abs(g.dy) < Math.abs(g.dx) * 1.1) return false;
      if (!sheetExpandedRef.current) return true;
      if (sheetHeightNum.current < SHEET_EXPANDED - 4) return true;
      if (scrollYRef.current <= 2 && g.dy > 4) return true;
      return false;
    },
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => {
      sheetDragStart.current = sheetHeightNum.current;
    },
    onPanResponderMove: (_, g) => {
      // Finger up (dy < 0) → taller sheet; finger down → shorter sheet.
      const next = Math.min(
        SHEET_EXPANDED,
        Math.max(SHEET_COLLAPSED, sheetDragStart.current - g.dy),
      );
      sheetHeightAnim.setValue(next);
      sheetHeightNum.current = next;
      sheetExpandedRef.current = next >= SHEET_MID;
    },
    onPanResponderRelease: (_, g) => {
      const current = sheetHeightNum.current;
      const flingUp = g.vy < -0.55;
      const flingDown = g.vy > 0.55;
      if (flingUp) snapSheet(true);
      else if (flingDown) snapSheet(false);
      else snapSheet(current >= SHEET_MID);
    },
    onPanResponderTerminate: () => {
      snapSheet(sheetHeightNum.current >= SHEET_MID);
    },
  }), [sheetHeightAnim, snapSheet]);

  // Warm permission prompt when Checkout opens (does not fetch GPS).
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

  // After Settings: clear blocked state only. Live GPS still requires recenter tap.
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (next) => {
      if (next !== 'active') return;
      if (gpsError !== GPS_ERROR_SETTINGS) return;
      try {
        const existing = await Location.getForegroundPermissionsAsync();
        if (!existing?.granted) return;
        setGpsError(null);
        setGpsStatus('idle');
      } catch (_) { /* ignore */ }
    });
    return () => sub.remove();
  }, [gpsError]);

  // Error bar: open Settings or clear error so user can tap recenter FAB.
  const openLocationPicker = async () => {
    setGpsError(null);
    const result = await requestPreciseLocationPermission();
    if (!result.granted) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setGpsStatus('error');
      if (result.needsSettings) {
        setGpsError(GPS_ERROR_SETTINGS);
        openAppLocationSettings();
      } else {
        setGpsError(GPS_ERROR_DENIED);
      }
      return;
    }
    // Permission ok — try live GPS via map picker; user can also tap recenter FAB.
    setGpsStatus('idle');
    locationPickerRef.current?.locateToLive?.();
  };

  // Lock map-center pin as delivery location, then open payment methods.
  const [confirmingContinue, setConfirmingContinue] = useState(false);
  const handleConfirmLocationContinue = useCallback(async () => {
    if (confirmingContinue) return;
    setConfirmingContinue(true);
    setSubmitError(null);
    try {
      await locationPickerRef.current?.confirmLocation?.();
      if (!coordinatesRef.current) {
        setSubmitError('Move the map to set your pin, then tap Confirm location.');
        return;
      }
      snapSheet(true);
    } finally {
      setConfirmingContinue(false);
    }
  }, [confirmingContinue, snapSheet]);

  const selectMode = (mode) => {
    if (mode === locationMode) return;

    setLocationMode(mode);
    setSubmitError(null);
    if (mode === 'manual') {
      // Manual form + payment methods — expand sheet.
      snapSheet(true);
    }

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
      coordinatesRef.current = null;
      setCoordinates(null);
      setGpsStatus('idle');
      snapSheet(false);
    }
  };

  const createOrder = async (currentBill) => {
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    Animated.spring(btnScale, { toValue: 0.95, useNativeDriver: true }).start();

    try {
      const pin = coordinatesRef.current || coordinates;
      const pinLat = pin?.lat != null ? Number(pin.lat) : null;
      const pinLng = pin?.lng != null ? Number(pin.lng) : null;
      const hasPin = Number.isFinite(pinLat) && Number.isFinite(pinLng);
      const orderResponse = await ordersApi.createOrder(
        {
          items: checkoutItems,
          deliveryAddress: address.trim(),
          address: address.trim(),
          // Explicit numbers + aliases so the API never drops the delivery pin.
          latitude: hasPin ? pinLat : undefined,
          longitude: hasPin ? pinLng : undefined,
          lat: hasPin ? pinLat : undefined,
          lng: hasPin ? pinLng : undefined,
          mapUrl: hasPin
            ? `https://www.google.com/maps/search/?api=1&query=${pinLat},${pinLng}`
            : undefined,
          map_url: hasPin
            ? `https://www.google.com/maps/search/?api=1&query=${pinLat},${pinLng}`
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
    // Map mode: delivery = confirmed pin under the marker (not live GPS by itself).
    if (locationMode === 'gps') {
      try {
        await locationPickerRef.current?.confirmLocation?.();
      } catch (_) { /* ignore */ }
      if (!coordinatesRef.current) {
        setSubmitError('Pin your delivery location on the map, then tap Confirm location.');
        snapSheet(false);
        return;
      }
    }
    if (!address.trim()) {
      if (locationMode === 'gps') {
        setSubmitError('Waiting for address… try again in a moment.');
        return;
      }
      setSubmitError('Please enter a delivery address');
      return;
    }
    if (!paymentMethod) {
      setSubmitError('Please select a payment method');
      snapSheet(true);
      return;
    }
    if (bill?.fastDeliveryEnabled && !deliveryType) {
      setSubmitError('Please select a delivery speed');
      snapSheet(true);
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
  const mapMode = locationMode !== 'manual';

  return (
    <View style={styles.immersiveRoot}>
      {/* Full-screen map behind the sheet (rider delivery style). */}
      {mapMode ? (
        <View style={styles.mapLayer} pointerEvents="box-none">
          <LocationPicker
            apiRef={locationPickerRef}
            inline
            immersive
            hideActions
            fullBleed
            // On open: ask for location if needed, then fly pin to live GPS.
            // Does NOT save delivery — user must still tap Confirm location.
            autoLocateOnMount
            sheetReserve={sheetReserve}
            // Do not pass confirmed coords as initialCenter — that can re-seed
            // the camera after Confirm. Camera stays where the user left it.
            onConfirm={applyPickedLocation}
            onLocateStatus={handleLocateStatus}
            onPinMoved={handlePinMoved}
          />
          {mapToast ? (
            <View
              style={[styles.mapStatusChipRow, { top: Math.max(insets.top, spacing.md) + spacing.sm }]}
              pointerEvents="none"
            >
              {mapToast === 'locating' ? (
                <View style={styles.mapStatusChip}>
                  <ActivityIndicator size="small" color={colors.textPrimary} />
                  <Text style={styles.mapStatusChipText}>Finding live location…</Text>
                </View>
              ) : mapToast === 'live' ? (
                <View style={[styles.mapStatusChip, styles.mapStatusChipSuccess]}>
                  <View style={styles.mapStatusChipDot}>
                    <AppIcon name="navigation" size={10} color={colors.textInverse} />
                  </View>
                  <Text style={[styles.mapStatusChipText, styles.mapStatusChipTextSuccess]}>
                    Moved to live location — adjust pin, then Confirm
                  </Text>
                </View>
              ) : (
                <View style={[styles.mapStatusChip, styles.mapStatusChipSuccess]}>
                  <View style={styles.mapStatusChipDot}>
                    <AppIcon name="check" size={10} color={colors.textInverse} />
                  </View>
                  <Text style={[styles.mapStatusChipText, styles.mapStatusChipTextSuccess]}>
                    Delivery pin saved
                  </Text>
                </View>
              )}
            </View>
          ) : null}
        </View>
      ) : (
        <View style={styles.manualBackdrop} />
      )}

      {/* Bottom sheet — drag up/down from anywhere on the drawer. */}
      <Animated.View
        style={[
          styles.checkoutSheet,
          !mapMode && styles.checkoutSheetManual,
          mapMode && { height: sheetHeightAnim },
        ]}
        {...(mapMode ? sheetPanResponder.panHandlers : {})}
      >
        <SafeAreaView
          style={styles.sheetSafe}
          // Top inset only in full-screen manual mode; footer handles bottom inset.
          edges={mapMode ? [] : ['top']}
        >
          <View style={styles.sheetDragZone}>
            {mapMode ? <View style={styles.sheetHandle} /> : null}
            <View style={[styles.sheetHeader, !mapMode && styles.sheetHeaderManual]}>
              <View style={styles.sheetHeaderText}>
                <Text style={styles.sheetTitle}>Checkout</Text>
                <Text style={styles.sheetStatusLine}>
                  {mapMode
                    ? 'Drag map to set pin · Confirm when ready'
                    : 'Enter delivery address'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => navigation.goBack()}
                style={styles.sheetIconBtn}
                accessibilityRole="button"
                accessibilityLabel="Go back"
              >
                <AppIcon name="back" size={22} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
          </View>

          <KeyboardAvoidingView
            style={styles.keyboardAvoid}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
          >
            <ScrollView
              ref={scrollRef}
              style={styles.sheetScroll}
              contentContainerStyle={styles.sheetScrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="always"
              keyboardDismissMode="none"
              nestedScrollEnabled
              scrollEnabled={sheetExpanded || !mapMode}
              onScroll={(e) => {
                scrollYRef.current = e.nativeEvent.contentOffset.y;
              }}
              scrollEventThrottle={16}
              bounces={sheetExpanded || !mapMode}
            >
              {mapMode && !sheetExpanded ? (
                <View style={styles.sheetActions}>
                  <SheetActionBtn
                    label={confirmingContinue ? 'Saving…' : 'Confirm location'}
                    icon="check"
                    variant="saffron"
                    busy={confirmingContinue}
                    disabled={isModeSelectDisabled || confirmingContinue}
                    onPress={handleConfirmLocationContinue}
                  />
                  <SheetActionBtn
                    label="Enter manually"
                    icon="edit"
                    variant="ghost"
                    disabled={isModeSelectDisabled}
                    onPress={() => selectMode('manual')}
                  />
                </View>
              ) : null}

            {mapMode && gpsStatus === 'error' && gpsErrorCopy ? (
              <View style={styles.gpsContainer}>
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
                  </View>
                </View>
              </View>
            ) : null}

            {locationMode === 'manual' && (
              <View style={styles.manualWrap}>
                <ManualAddressField
                  visible
                  value={address}
                  onTouch={handleAddressTouch}
                  onChangeText={handleAddressChange}
                  onClear={handleAddressClear}
                />
                <TouchableOpacity
                  onPress={() => selectMode('gps')}
                  disabled={isModeSelectDisabled}
                  style={styles.useMapInsteadBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Use map instead"
                >
                  <AppIcon name="navigation" size={14} color={colors.saffronDark} />
                  <Text style={styles.useMapInsteadText}>Use map instead</Text>
                </TouchableOpacity>
              </View>
            )}

        {/* Full form only when sheet is pulled up (or manual mode fills the screen). */}
        {(sheetExpanded || !mapMode) ? (
        <>
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
        </>
        ) : (
          submitError ? (
            <View style={styles.errorBanner}>
              <AppIcon name="delete" size={16} color={colors.error} style={{ marginRight: spacing.sm }} />
              <Text style={styles.errorBannerText}>{submitError}</Text>
            </View>
          ) : null
        )}

          </ScrollView>

            {/* Sheet footer — Place Order always visible */}
            <View
              style={[
                styles.sheetFooter,
                // Keep CTA above the system gesture / nav bar (Android edge-to-edge).
                { paddingBottom: Math.max(insets.bottom, spacing.sm) },
              ]}
              collapsable={false}
            >
              {shopStatus === 'closed' ? (
                <View style={[styles.customPlaceOrderBtn, styles.customPlaceOrderBtnDisabled]}>
                  <Text style={styles.placeOrderBtnTextDisabled}>Shop is Closed</Text>
                </View>
              ) : !deliveryAvailable ? (
                <View style={[styles.customPlaceOrderBtn, styles.customPlaceOrderBtnDisabled]}>
                  <Text style={styles.placeOrderBtnTextDisabled}>Delivery Unavailable</Text>
                </View>
              ) : (
                <SheetActionBtn
                  label={placeOrderLabel}
                  icon={isSubmitting || isCalculating ? null : 'check'}
                  variant="success"
                  busy={isSubmitting || isCalculating}
                  disabled={isPlaceOrderDisabled || shopStatus === 'closed' || !deliveryAvailable}
                  onPress={handlePlaceOrder}
                />
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
        </SafeAreaView>
      </Animated.View>

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
    </View>
  );
}

const styles = StyleSheet.create({
  immersiveRoot: {
    flex: 1,
    backgroundColor: colors.bgApp,
  },
  mapLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  manualBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.bgApp,
  },
  // Rider-order-style bottom sheet over the map (height animated).
  checkoutSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bgSurface,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    ...shadows.cardRaised,
    overflow: 'hidden',
  },
  checkoutSheetManual: {
    // Fill the parent (not window height) so nothing peeks under the nav bar.
    top: 0,
    bottom: 0,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
  sheetSafe: {
    flex: 1,
    minHeight: 0,
  },
  sheetDragZone: {
    paddingBottom: spacing.xs,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  sheetScroll: {
    flexGrow: 1,
    flexShrink: 1,
  },
  sheetScrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    flexGrow: 0,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  sheetHeaderManual: {
    paddingTop: spacing.sm,
  },
  sheetHeaderText: {
    flex: 1,
    // Nudge title + subtitle slightly right from the left edge.
    paddingLeft: spacing.lg + spacing.sm,
  },
  sheetIconBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.circle,
    backgroundColor: colors.bgApp,
    alignItems: 'center',
    justifyContent: 'center',
    // Nudge back button slightly inward from the right edge.
    marginRight: spacing.sm,
  },
  sheetTitle: {
    ...typography.h2,
    fontSize: 20,
    color: colors.textPrimary,
    textAlign: 'left',
  },
  sheetStatusLine: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '700',
    textAlign: 'left',
  },
  sheetAddress: {
    ...typography.body,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    fontWeight: '600',
  },
  sheetActions: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  sheetPrimaryBtn: {
    minHeight: 50,
    borderRadius: radius.button,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  sheetPrimaryBtnDisabled: {
    opacity: 0.55,
  },
  sheetPrimaryBtnText: {
    color: colors.textInverse,
    fontWeight: '800',
    fontSize: 15,
  },
  sheetGhostBtn: {
    minHeight: 44,
    borderRadius: radius.button,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.bgApp,
  },
  sheetGhostBtnText: {
    color: colors.textSecondary,
    fontWeight: '800',
    fontSize: 14,
  },
  sheetFooter: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: spacing.xs,
    backgroundColor: colors.bgSurface,
  },
  keyboardAvoid: {
    flex: 1,
    minHeight: 0,
  },
  // Compact floating pill on the map (loading / location set).
  mapStatusChipRow: {
    position: 'absolute',
    top: spacing.md,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 5,
  },
  mapStatusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    ...shadows.sm,
  },
  mapStatusChipSuccess: {
    backgroundColor: 'rgba(232, 255, 244, 0.96)',
    borderColor: colors.palette.success200,
  },
  mapStatusChipDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapStatusChipText: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  mapStatusChipTextSuccess: {
    color: colors.successDark,
  },
  manualWrap: {
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  useMapInsteadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
  },
  useMapInsteadText: {
    ...typography.label,
    color: colors.saffronDark,
    fontWeight: '700',
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
  gpsContainer: {
    marginTop: spacing.sm,
    marginBottom: spacing.md,
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
  // Shared option-card layout used by Payment Method (UPI / COD).
  // Restored after map redesign removed Delivery Details option cards but
  // left the payment row still referencing these styles (buttons collapsed).
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
  optionCardTitle: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '500',
    textAlign: 'center',
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
  customPlaceOrderBtn: {
    minHeight: 50,
    backgroundColor: colors.success,
    borderRadius: radius.button,
    justifyContent: 'center',
    alignItems: 'center',
  },
  customPlaceOrderBtnDisabled: {
    backgroundColor: colors.bgDisabled || '#DFE2E6',
  },
  placeOrderBtnTextDisabled: {
    ...typography.buttonLarge,
    color: colors.textDisabled,
    fontWeight: '800',
    fontSize: 15,
  },
  backToCartBtn: {
    alignItems: 'center',
    paddingVertical: spacing.xs,
    marginTop: spacing.xs,
  },
  backToCartText: {
    ...typography.label,
    color: colors.textSecondary,
  },
});
