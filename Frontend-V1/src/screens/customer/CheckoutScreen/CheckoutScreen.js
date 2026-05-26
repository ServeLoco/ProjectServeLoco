import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Animated,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import * as Location from 'expo-location';
import { useNavigation } from '@react-navigation/native';
import {
  AppScreen,
  AppHeader,
  AppIcon,
  TextInputField,
  Button,
  PressableScale,
} from '../../../components';
import { colors, typography, spacing, radius, shadows } from '../../../theme';
import { useCartStore, useSettingsStore, useAuthStore } from '../../../stores';
import { cartApi, ordersApi } from '../../../api';
import { normalizeCartCalculation } from '../../../utils';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const requestLocationPermission = async () => {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === Location.PermissionStatus.GRANTED;
};

export default function CheckoutScreen() {
  const navigation = useNavigation();
  const { items, clearCart } = useCartStore();
  const shopStatus = useSettingsStore(state => state.shopStatus);
  const minimumOrder = useSettingsStore(state => state.minimumOrder);
  const userProfile = useAuthStore(state => state.profile);

  // Form State
  const [address, setAddress] = useState(userProfile?.address || '');
  const [coordinates, setCoordinates] = useState(null);
  const [gpsStatus, setGpsStatus] = useState('idle'); // idle | loading | success | error
  const [gpsError, setGpsError] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('Cash'); // Cash | UPI

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
      quantity: item.quantity,
      type,
      isCombo: type === 'combo',
    };
  }), [items]);
  const calculationPayload = useMemo(() => ({
    items: checkoutItems,
    latitude: coordinates?.lat,
    longitude: coordinates?.lng,
  }), [checkoutItems, coordinates]);

  // Animations
  const deliverySlide = useRef(new Animated.Value(20)).current;
  const paymentSlide = useRef(new Animated.Value(20)).current;
  const summarySlide = useRef(new Animated.Value(20)).current;
  const btnScale = useRef(new Animated.Value(1)).current;
  const arrowAnim = useRef(new Animated.Value(0)).current;
  const gpsPulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Staggered entrance
    Animated.stagger(100, [
      Animated.timing(deliverySlide, { toValue: 0, duration: 400, useNativeDriver: true }),
      Animated.timing(paymentSlide, { toValue: 0, duration: 400, useNativeDriver: true }),
      Animated.timing(summarySlide, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start();
  }, [deliverySlide, paymentSlide, summarySlide]);

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

    const calculateCheckoutBill = async () => {
      if (checkoutItems.length === 0) {
        setBill(null);
        setCalcError(null);
        return;
      }

      setIsCalculating(true);
      setCalcError(null);

      try {
        const calculatedBill = normalizeCartCalculation(await cartApi.calculate(calculationPayload));
        if (isActive) {
          setBill(calculatedBill);
        }
      } catch (error) {
        if (isActive) {
          setBill(null);
          setCalcError(error.message || 'Unable to calculate checkout total.');
        }
      } finally {
        if (isActive) {
          setIsCalculating(false);
        }
      }
    };

    calculateCheckoutBill();

    return () => {
      isActive = false;
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
        setGpsError('Location permission was denied. GPS location is required for delivery range and pricing.');
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setCoordinates({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      });
      setGpsStatus('success');
    } catch (error) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setGpsStatus('error');
      setGpsError(error.message || 'Failed to get location. Please try again.');
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

  const handlePlaceOrder = async () => {
    if (!address.trim()) {
      setSubmitError('Please enter a delivery address');
      return;
    }
    if (shopStatus === 'closed') {
      setSubmitError('The shop is currently closed. We cannot accept orders right now.');
      return;
    }
    if (!coordinates) {
      setSubmitError('Please pin your GPS location to calculate delivery distance.');
      return;
    }
    if (isCalculating || calcError || !bill) {
      setSubmitError('Please wait while we verify the order total.');
      return;
    }
    if (bill.requiresLocation) {
      setSubmitError(bill.deliveryMessage || 'Please pin your GPS location to calculate delivery distance.');
      return;
    }
    if (!bill.deliveryWithinRange) {
      setSubmitError(bill.deliveryMessage || 'Delivery is not available at this location.');
      return;
    }
    
    setSubmitError(null);
    setIsSubmitting(true);

    // Animate button loading state
    Animated.spring(btnScale, { toValue: 0.95, useNativeDriver: true }).start();

    try {
      const verifiedBill = normalizeCartCalculation(await cartApi.calculate(calculationPayload));
      setBill(verifiedBill);

      if (verifiedBill.requiresLocation) {
        setSubmitError(verifiedBill.deliveryMessage || 'Please pin your GPS location to calculate delivery distance.');
        return;
      }

      if (!verifiedBill.deliveryWithinRange) {
        setSubmitError(verifiedBill.deliveryMessage || 'Delivery is not available at this location.');
        return;
      }

      const orderResponse = await ordersApi.createOrder({
        items: checkoutItems,
        deliveryAddress: address.trim(),
        address: address.trim(),
        latitude: coordinates?.lat,
        longitude: coordinates?.lng,
        mapUrl: coordinates
          ? `https://www.google.com/maps/search/?api=1&query=${coordinates.lat},${coordinates.lng}`
          : undefined,
        paymentMethod,
      });
      const responseOrder = orderResponse?.order || orderResponse?.data || orderResponse;
      const orderId = responseOrder?.id || responseOrder?.orderId || orderResponse?.orderId;

      clearCart();
      navigation.navigate('OrderConfirmation', {
        orderId,
        order: {
          ...responseOrder,
          id: orderId,
          address: address.trim(),
          total: responseOrder?.total || bill.grandTotal,
          paymentMethod,
        },
      });
    } catch (error) {
      setSubmitError(error.message || 'Unable to place order. Please try again.');
    } finally {
      setIsSubmitting(false);
      Animated.spring(btnScale, { toValue: 1, useNativeDriver: true }).start();
    }
  };

  const requiredMinimum = bill?.minimumOrder || minimumOrder || 0;
  const isBelowMinimum = Boolean(bill && requiredMinimum && bill.subtotal < requiredMinimum);
  const totalQuantity = items.reduce((total, item) => total + (Number(item.quantity) || 0), 0);
  const hasPinnedLocation = Boolean(coordinates);
  const hasInvalidDelivery = Boolean(bill && (bill.requiresLocation || !bill.deliveryWithinRange));
  const isPlaceOrderDisabled = isSubmitting || isCalculating || items.length === 0 || !bill || Boolean(calcError) || !hasPinnedLocation || hasInvalidDelivery;
  const placeOrderLabel = isSubmitting
    ? 'Processing...'
    : !hasPinnedLocation
    ? 'Pin Location to Continue'
    : hasInvalidDelivery
    ? 'Delivery Not Available'
    : bill
    ? `Place Order • Rs. ${bill.grandTotal}`
    : isCalculating
    ? 'Calculating total...'
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

          <View style={styles.gpsContainer}>
            {gpsStatus === 'idle' || gpsStatus === 'error' ? (
              <Button 
                label={gpsStatus === 'error' ? "Retry GPS Location" : "Use Current Location"}
                variant="outline"
                onPress={handleRequestGPS}
                style={styles.gpsBtn}
              />
            ) : gpsStatus === 'loading' ? (
              <View style={styles.gpsLoading}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.gpsLoadingText}>Fetching location...</Text>
              </View>
            ) : (
              <View style={styles.gpsSuccess}>
                <Animated.View style={[styles.gpsSuccessIconFrame, { transform: [{ scale: gpsPulse }] }]}>
                  <AppIcon name="location" size={22} color={colors.success} />
                </Animated.View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.gpsSuccessText}>Location Pinned</Text>
                  <Text style={styles.gpsCoords}>
                    {coordinates?.lat?.toFixed(6)}, {coordinates?.lng?.toFixed(6)}
                  </Text>
                </View>
                <TouchableOpacity style={styles.mapActionBtn} onPress={handleOpenMap}>
                  <AppIcon name="navigation" size={16} color={colors.primary} />
                </TouchableOpacity>
              </View>
            )}

            {gpsStatus === 'error' && (
              <View style={styles.gpsErrorContainer}>
                <AppIcon name="delete" size={16} color={colors.error} style={{ marginRight: spacing.sm }} />
                <Text style={styles.gpsErrorText}>{gpsError || 'Failed to get location. Please try again.'}</Text>
              </View>
            )}
          </View>
        </Animated.View>

        {/* Payment Method */}
        <Animated.View style={[styles.section, { transform: [{ translateY: paymentSlide }] }]}>
          <Text style={styles.sectionTitle}>Payment Method</Text>
          
          <View style={styles.paymentOptions}>
            <PressableScale 
              style={[styles.paymentBox, paymentMethod === 'Cash' && styles.paymentBoxActive]}
              onPress={() => setPaymentMethod('Cash')}
              scaleTo={0.96}
            >
              <AppIcon
                name="rupee"
                size={28}
                color={paymentMethod === 'Cash' ? colors.success : colors.textSecondary}
                style={styles.paymentIcon}
              />
              <Text style={[styles.paymentText, paymentMethod === 'Cash' && styles.paymentTextActive]}>Cash on Delivery</Text>
            </PressableScale>

            <PressableScale 
              style={[styles.paymentBox, paymentMethod === 'UPI' && styles.paymentBoxActive]}
              onPress={() => setPaymentMethod('UPI')}
              scaleTo={0.96}
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
            {paymentMethod === 'UPI' ? 'You will be redirected to UPI app after placing the order.' : 'Pay cash to the delivery executive.'}
          </Text>
        </Animated.View>

        {/* Order Summary */}
        <Animated.View style={[styles.section, { transform: [{ translateY: summarySlide }] }]}>
          <Text style={styles.sectionTitle}>Order Summary</Text>
          
          <View style={styles.summaryBox}>
            {isCalculating ? (
              <Text style={styles.calcText}>Calculating verified total...</Text>
            ) : calcError ? (
              <Text style={styles.calcErrorText}>{calcError}</Text>
            ) : bill ? (
              <>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Items ({totalQuantity})</Text>
                  <Text style={styles.summaryValue}>₹{bill.subtotal}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Delivery</Text>
                  <Text style={styles.summaryValue}>{bill.deliveryCharge === 0 ? 'FREE' : `₹${bill.deliveryCharge}`}</Text>
                </View>
                {bill.deliveryDistanceKm !== null && bill.deliveryDistanceKm !== undefined && (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Distance</Text>
                    <Text style={styles.summaryValue}>{Number(bill.deliveryDistanceKm).toFixed(2)} km</Text>
                  </View>
                )}
                {(bill.deliveryMessage || bill.requiresLocation || !bill.deliveryWithinRange || bill.freeDeliveryOfferActive) && (
                  <Text style={[
                    styles.deliveryStatusText,
                    !bill.deliveryWithinRange && styles.deliveryStatusError,
                    bill.freeDeliveryOfferActive && styles.deliveryStatusSuccess,
                  ]}>
                    {bill.deliveryMessage || (bill.requiresLocation ? 'Pin location to calculate delivery.' : `Delivery available within ${bill.deliveryRadiusKm || 8} km.`)}
                  </Text>
                )}
                {bill.nightCharge > 0 && (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Night Charge</Text>
                    <Text style={styles.summaryValue}>₹{bill.nightCharge}</Text>
                  </View>
                )}
                {bill.discount > 0 && (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Discount</Text>
                    <Text style={styles.summaryValue}>- ₹{bill.discount}</Text>
                  </View>
                )}
                <View style={styles.divider} />
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryTotalLabel}>Total to Pay</Text>
                  <Text style={styles.summaryTotalValue}>₹{bill.grandTotal}</Text>
                </View>
                {isBelowMinimum && (
                  <View style={styles.warningBox}>
                    <AppIcon name="box" size={16} color={colors.saffron || '#FF7A3A'} style={styles.warningIcon} />
                    <Text style={styles.warningText}>
                      Add items worth <Text style={styles.warningHighlight}>₹{(requiredMinimum - bill.subtotal).toFixed(0)}</Text> more
                      {bill.freeAboveThresholdActive ? <Text> for <Text style={styles.warningHighlight}>Free Delivery</Text></Text> : null}
                      <Text> (₹{bill.deliveryCharge} delivery fee currently applied).</Text>
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
      <View style={styles.bottomBar}>
        {isPlaceOrderDisabled && !isSubmitting && !isCalculating ? (
          <View style={[styles.customPlaceOrderBtn, styles.customPlaceOrderBtnDisabled]}>
            <Text style={styles.placeOrderBtnTextDisabled}>{placeOrderLabel}</Text>
          </View>
        ) : (
          <PressableScale
            onPress={handlePlaceOrder}
            disabled={isPlaceOrderDisabled}
            style={[
              styles.customPlaceOrderBtn,
              isPlaceOrderDisabled && styles.customPlaceOrderBtnDisabled
            ]}
            scaleTo={0.96}
            accessibilityRole="button"
            accessibilityLabel={bill ? `Place Order, ₹${bill.grandTotal}` : 'Place Order'}
          >
            <View style={styles.placeOrderBtnContent}>
              {isSubmitting || isCalculating ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : null}
              <Text style={styles.placeOrderBtnText}>
                {isSubmitting
                  ? 'Processing...'
                  : isCalculating
                  ? 'Calculating total...'
                  : bill
                  ? `Place Order • ₹${bill.grandTotal}`
                  : 'Place Order'}
              </Text>
              {!isSubmitting && !isCalculating && bill && (
                <Animated.View style={[styles.placeOrderBtnArrow, { transform: [{ translateX: arrowAnim }] }]}>
                  <AppIcon name="chevronRight" size={16} color="#FFFFFF" />
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
    marginBottom: spacing.md,
  },
  addressInput: {
    marginBottom: spacing.md,
  },
  gpsContainer: {
    marginTop: spacing.sm,
  },
  gpsBtn: {
    alignSelf: 'flex-start',
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
  paymentOptions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.sm,
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
  paymentPendingNote: {
    ...typography.caption,
    color: colors.textTertiary,
    fontStyle: 'italic',
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
  calcText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  calcErrorText: {
    ...typography.body,
    color: colors.error,
  },
  minimumOrderText: {
    ...typography.caption,
    color: colors.warning,
    marginTop: spacing.xs,
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
