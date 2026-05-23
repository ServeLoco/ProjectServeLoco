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
  PermissionsAndroid,
  Platform,
  UIManager,
} from 'react-native';
import Geolocation from '@react-native-community/geolocation';
import { useNavigation } from '@react-navigation/native';
import {
  AppScreen,
  AppHeader,
  TextInputField,
  Button,
} from '../../../components';
import { colors, typography, spacing, radius, shadows, layout } from '../../../theme';
import { useCartStore, useSettingsStore, useAuthStore } from '../../../stores';
import { cartApi, ordersApi } from '../../../api';
import { normalizeCartCalculation } from '../../../utils';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const requestLocationPermission = async () => {
  if (Platform.OS !== 'android') {
    return true;
  }

  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    {
      title: 'Use current location',
      message: 'ServeLoco needs your location to pin your delivery address.',
      buttonPositive: 'Allow',
      buttonNegative: 'Deny',
    },
  );

  return result === PermissionsAndroid.RESULTS.GRANTED;
};

const getLocationErrorMessage = error => {
  if (error?.code === 1) {
    return 'Location permission was denied. You can enter the address manually.';
  }

  if (error?.code === 2) {
    return 'Unable to detect location. Please check GPS and try again.';
  }

  if (error?.code === 3) {
    return 'Location request timed out. Please try again.';
  }

  return 'Failed to get location. Please try again.';
};

export default function CheckoutScreen() {
  const navigation = useNavigation();
  const { items, clearCart } = useCartStore();
  const shopStatus = useSettingsStore(state => state.shopStatus);
  const minimumOrder = useSettingsStore(state => state.minimumOrder);
  const userProfile = useAuthStore(state => state.profile);
  const checkoutItems = useMemo(() => items.map(item => ({
    productId: item.product.id,
    quantity: item.quantity,
  })), [items]);

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

  // Animations
  const deliverySlide = useRef(new Animated.Value(20)).current;
  const paymentSlide = useRef(new Animated.Value(20)).current;
  const summarySlide = useRef(new Animated.Value(20)).current;
  const btnScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Staggered entrance
    Animated.stagger(100, [
      Animated.timing(deliverySlide, { toValue: 0, duration: 400, useNativeDriver: true }),
      Animated.timing(paymentSlide, { toValue: 0, duration: 400, useNativeDriver: true }),
      Animated.timing(summarySlide, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start();
  }, [deliverySlide, paymentSlide, summarySlide]);

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
        const calculatedBill = normalizeCartCalculation(await cartApi.calculate({ items: checkoutItems }));
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
  }, [checkoutItems]);

  const handleRequestGPS = async () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setGpsStatus('loading');
    setGpsError(null);

    try {
      const hasPermission = await requestLocationPermission();

      if (!hasPermission) {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setGpsStatus('error');
        setGpsError('Location permission was denied. You can enter the address manually.');
        return;
      }

      Geolocation.getCurrentPosition(
        position => {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setCoordinates({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
          setGpsStatus('success');
        },
        error => {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setGpsStatus('error');
          setGpsError(getLocationErrorMessage(error));
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 30000,
        },
      );
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
    if (isCalculating || calcError || !bill) {
      setSubmitError('Please wait while we verify the order total.');
      return;
    }
    
    setSubmitError(null);
    setIsSubmitting(true);

    // Animate button loading state
    Animated.spring(btnScale, { toValue: 0.95, useNativeDriver: true }).start();

    try {
      const verifiedBill = normalizeCartCalculation(await cartApi.calculate({ items: checkoutItems }));
      const verifiedMinimum = verifiedBill.minimumOrder || minimumOrder || 0;

      setBill(verifiedBill);

      if (verifiedMinimum && verifiedBill.subtotal < verifiedMinimum) {
        setSubmitError(`Minimum order is Rs. ${verifiedMinimum}. Add items worth Rs. ${verifiedMinimum - verifiedBill.subtotal} more.`);
        return;
      }

      const orderResponse = await ordersApi.createOrder({
        items: checkoutItems,
        deliveryAddress: address.trim(),
        address: address.trim(),
        coordinates,
        paymentMethod,
      });

      clearCart();
      navigation.navigate('OrderConfirmation', {
        orderId: orderResponse?.id || orderResponse?.order?.id || orderResponse?.data?.id,
        order: orderResponse?.order || orderResponse?.data || orderResponse,
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
  const isPlaceOrderDisabled = isSubmitting || isCalculating || items.length === 0 || !bill || Boolean(calcError) || isBelowMinimum;
  const placeOrderLabel = isSubmitting
    ? 'Processing...'
    : bill
    ? `Place Order • Rs. ${bill.grandTotal}`
    : isCalculating
    ? 'Calculating total...'
    : 'Place Order';

  return (
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
                <Text style={styles.gpsSuccessIcon}>Loc</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.gpsSuccessText}>Location Pinned</Text>
                  <Text style={styles.gpsCoords}>
                    {coordinates?.lat?.toFixed(6)}, {coordinates?.lng?.toFixed(6)}
                  </Text>
                </View>
                <TouchableOpacity style={styles.mapActionBtn} onPress={handleOpenMap}>
                  <Text style={styles.mapActionText}>Map</Text>
                </TouchableOpacity>
              </View>
            )}

            {gpsStatus === 'error' && (
              <Text style={styles.gpsErrorText}>{gpsError || 'Failed to get location. Please try again.'}</Text>
            )}
          </View>
        </Animated.View>

        {/* Payment Method */}
        <Animated.View style={[styles.section, { transform: [{ translateY: paymentSlide }] }]}>
          <Text style={styles.sectionTitle}>Payment Method</Text>
          
          <View style={styles.paymentOptions}>
            <TouchableOpacity 
              activeOpacity={0.8}
              style={[styles.paymentBox, paymentMethod === 'Cash' && styles.paymentBoxActive]}
              onPress={() => setPaymentMethod('Cash')}
            >
              <Text style={styles.paymentIcon}>Cash</Text>
              <Text style={[styles.paymentText, paymentMethod === 'Cash' && styles.paymentTextActive]}>Cash on Delivery</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              activeOpacity={0.8}
              style={[styles.paymentBox, paymentMethod === 'UPI' && styles.paymentBoxActive]}
              onPress={() => setPaymentMethod('UPI')}
            >
              <Text style={styles.paymentIcon}>UPI</Text>
              <Text style={[styles.paymentText, paymentMethod === 'UPI' && styles.paymentTextActive]}>UPI / Online</Text>
            </TouchableOpacity>
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
                  <Text style={styles.summaryLabel}>Items ({items.length})</Text>
                  <Text style={styles.summaryValue}>Rs. {bill.subtotal}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Delivery</Text>
                  <Text style={styles.summaryValue}>{bill.deliveryCharge === 0 ? 'FREE' : `Rs. ${bill.deliveryCharge}`}</Text>
                </View>
                {bill.nightCharge > 0 && (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Night Charge</Text>
                    <Text style={styles.summaryValue}>Rs. {bill.nightCharge}</Text>
                  </View>
                )}
                {bill.discount > 0 && (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Discount</Text>
                    <Text style={styles.summaryValue}>- Rs. {bill.discount}</Text>
                  </View>
                )}
                <View style={styles.divider} />
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryTotalLabel}>Total to Pay</Text>
                  <Text style={styles.summaryTotalValue}>Rs. {bill.grandTotal}</Text>
                </View>
                {isBelowMinimum && (
                  <Text style={styles.minimumOrderText}>
                    Add items worth Rs. {requiredMinimum - bill.subtotal} more to place this order.
                  </Text>
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
            <Text style={styles.errorBannerText}>{submitError}</Text>
          </View>
        )}

      </ScrollView>

      {/* Bottom Action Bar */}
      <View style={styles.bottomBar}>
        <Animated.View style={{ transform: [{ scale: btnScale }] }}>
          <Button 
            label={placeOrderLabel}
            onPress={handlePlaceOrder}
            disabled={isPlaceOrderDisabled}
            loading={isSubmitting}
            style={styles.placeOrderBtn}
          />
        </Animated.View>
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
    paddingBottom: spacing.xxxl,
  },
  section: {
    backgroundColor: colors.bgSurface,
    padding: spacing.lg,
    marginBottom: spacing.md,
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
    backgroundColor: colors.success + '1A',
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.success + '40',
  },
  gpsSuccessIcon: {
    fontSize: 24,
    marginRight: spacing.sm,
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
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  mapActionText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '600',
  },
  gpsErrorText: {
    ...typography.caption,
    color: colors.error,
    marginTop: spacing.sm,
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
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgApp,
  },
  paymentBoxActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '0D',
  },
  paymentIcon: {
    fontSize: 28,
    marginBottom: spacing.xs,
  },
  paymentText: {
    ...typography.label,
    color: colors.textSecondary,
  },
  paymentTextActive: {
    color: colors.primary,
    fontWeight: '600',
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
  errorBanner: {
    margin: spacing.lg,
    padding: spacing.md,
    backgroundColor: colors.error + '1A',
    borderRadius: radius.md,
    borderLeftWidth: 4,
    borderLeftColor: colors.error,
  },
  errorBannerText: {
    ...typography.body,
    color: colors.error,
  },
  bottomBar: {
    backgroundColor: colors.bgSurface,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: layout.bottomNavHeight,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    ...shadows.xl,
  },
  placeOrderBtn: {
    marginBottom: spacing.md,
  },
  backToCartBtn: {
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  backToCartText: {
    ...typography.label,
    color: colors.textSecondary,
  },
});
