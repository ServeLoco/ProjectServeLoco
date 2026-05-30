import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Animated,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Linking,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import * as Location from 'expo-location';
import { CommonActions, useNavigation } from '@react-navigation/native';
import {
  AppScreen,
  AppHeader,
  AppIcon,
  TextInputField,
  PressableScale,
} from '../../../components';
import { colors, typography, spacing, radius, shadows } from '../../../theme';
import { useCartStore, useSettingsStore, useAuthStore } from '../../../stores';
import { cartApi, ordersApi, settingsApi, imagesApi } from '../../../api';
import { normalizeCartCalculation, normalizeImageUrl, normalizeSettings } from '../../../utils';

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
  const deliveryAvailable = useSettingsStore(state => state.deliveryAvailable);
  const minimumOrder = useSettingsStore(state => state.minimumOrder);
  const upiId = useSettingsStore(state => state.upiId);
  const upiQrImageId = useSettingsStore(state => state.upiQrImageId);
  const upiQrImageUrl = useSettingsStore(state => state.upiQrImageUrl);
  const setSettings = useSettingsStore(state => state.setSettings);
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
        setGpsError('Location permission was denied. GPS location is required for delivery.');
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setBill(null);
      setCalcError(null);
      setSubmitError(null);
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
      setSubmitError('Please pin your GPS location to proceed.');
      return;
    }
    if (isCalculating || calcError || !bill) {
      setSubmitError('Please wait while we verify the order total.');
      return;
    }
    if (bill.requiresLocation) {
      setSubmitError(bill.deliveryMessage || 'Please pin your GPS location to proceed.');
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
        setSubmitError(verifiedBill.deliveryMessage || 'Please pin your GPS location to proceed.');
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
      const confirmationParams = {
        orderId,
        order: {
          ...responseOrder,
          id: orderId,
          address: address.trim(),
          total: responseOrder?.total || bill.grandTotal,
          paymentMethod,
        },
      };

      clearCart();
      navigation.dispatch(
        CommonActions.reset({
          index: 1,
          routes: [
            { name: 'MainTabs', params: { screen: 'Orders' } },
            { name: 'OrderConfirmation', params: confirmationParams },
          ],
        })
      );
    } catch (error) {
      setSubmitError(error.message || 'Unable to place order. Please try again.');
    } finally {
      setIsSubmitting(false);
      Animated.spring(btnScale, { toValue: 1, useNativeDriver: true }).start();
    }
  };

  const requiredMinimum = bill?.minimumOrder || minimumOrder || 0;
  const isBelowFreeDeliveryThreshold = Boolean(bill && requiredMinimum && bill.subtotal < requiredMinimum);
  const deliveryLabel = bill?.belowThreshold || isBelowFreeDeliveryThreshold
    ? 'Delivery Charge (Below Minimum)'
    : 'Delivery Charge';
  const totalQuantity = items.reduce((total, item) => total + (Number(item.quantity) || 0), 0);
  const hasPinnedLocation = Boolean(coordinates);
  const hasInvalidDelivery = Boolean(bill && (!bill.deliveryWithinRange || (hasPinnedLocation && bill.requiresLocation)));
  const isPinLocationDisabled = isSubmitting || gpsStatus === 'loading' || items.length === 0 || !address.trim();
  const isPlaceOrderDisabled = isSubmitting || isCalculating || items.length === 0 || !bill || Boolean(calcError) || hasInvalidDelivery;
  const isPrimaryActionDisabled = hasPinnedLocation
    ? isPlaceOrderDisabled || shopStatus === 'closed' || !deliveryAvailable
    : isPinLocationDisabled || shopStatus === 'closed' || !deliveryAvailable;
  const placeOrderLabel = isSubmitting
    ? 'Processing...'
    : gpsStatus === 'loading'
    ? 'Pinning Location...'
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
            {gpsStatus === 'idle' ? (
              <View style={styles.gpsHintBox}>
                <AppIcon name="location" size={18} color={colors.textSecondary} />
                <Text style={styles.gpsHintText}>Tap the bottom button to pin your delivery location.</Text>
              </View>
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
                    <Image
                      source={{ uri: upiQrImageUrl }}
                      style={styles.qrImage}
                      resizeMode="contain"
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
                  <Text style={styles.summaryLabel}>{deliveryLabel}</Text>
                  <Text style={styles.summaryValue}>{bill.deliveryCharge === 0 ? 'FREE' : `₹${bill.deliveryCharge}`}</Text>
                </View>
                {/* Distance display removed since it's no longer used for pricing */}
                {(!deliveryAvailable) ? (
                  <Text style={[styles.deliveryStatusText, styles.deliveryStatusError]}>
                    Delivery is currently unavailable in your area.
                  </Text>
                ) : (bill.deliveryMessage || bill.requiresLocation || !bill.deliveryWithinRange || bill.freeDeliveryOfferActive) ? (
                  <Text style={[
                    styles.deliveryStatusText,
                    !bill.deliveryWithinRange && styles.deliveryStatusError,
                    bill.freeDeliveryOfferActive && styles.deliveryStatusSuccess,
                  ]}>
                    {bill.deliveryMessage || (bill.requiresLocation ? 'Pin location to continue.' : 'Delivery available.')}
                  </Text>
                ) : null}
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
                {isBelowFreeDeliveryThreshold && (
                  <View style={styles.warningBox}>
                    <AppIcon name="box" size={16} color={colors.saffron || '#FF7A3A'} style={styles.warningIcon} />
                    <Text style={styles.warningText}>
                      Add items worth <Text style={styles.warningHighlight}>₹{(requiredMinimum - bill.subtotal).toFixed(0)}</Text> more
                      {bill.freeAboveThresholdActive
                        ? <Text> to unlock <Text style={styles.warningHighlight}>Free Delivery</Text></Text>
                        : <Text> to reach the preferred order value</Text>}
                      <Text> (₹{bill.belowThresholdDeliveryCharge || bill.deliveryCharge} delivery fee currently applied).</Text>
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
          onPress={hasPinnedLocation ? handlePlaceOrder : handleRequestGPS}
          disabled={isPrimaryActionDisabled}
          style={[
            styles.customPlaceOrderBtn,
            isPrimaryActionDisabled && styles.customPlaceOrderBtnDisabled
          ]}
          scaleTo={0.96}
          accessibilityRole="button"
          accessibilityLabel={hasPinnedLocation && bill ? `Place Order, ₹${bill.grandTotal}` : 'Pin Location to Continue'}
        >
          <View style={styles.placeOrderBtnContent}>
            {isSubmitting || isCalculating || gpsStatus === 'loading' ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : null}
            <Text style={isPrimaryActionDisabled ? styles.placeOrderBtnTextDisabled : styles.placeOrderBtnText}>
              {placeOrderLabel}
            </Text>
            {!isSubmitting && !isCalculating && gpsStatus !== 'loading' && (
              <Animated.View style={[styles.placeOrderBtnArrow, { transform: [{ translateX: arrowAnim }] }]}>
                <AppIcon name={hasPinnedLocation ? 'chevronRight' : 'location'} size={16} color={isPrimaryActionDisabled ? colors.textDisabled : '#FFFFFF'} />
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
  gpsHintBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.bgApp,
    borderWidth: 1,
    borderColor: colors.border,
  },
  gpsHintText: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
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
